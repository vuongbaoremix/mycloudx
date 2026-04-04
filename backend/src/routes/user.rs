use axum::http::header;
use axum::response::IntoResponse;
use axum::{extract::State, http::StatusCode, Json};
use serde::Deserialize;

use crate::auth::jwt::{self, Claims};
use crate::auth::password;
use crate::crypto;
use crate::models::user::{User, UserResponse, UserSettings};
use crate::routes::auth as auth_routes;
use crate::AppState;

#[derive(Deserialize)]
pub struct UpdateProfileRequest {
    pub name: Option<String>,
    pub avatar: Option<String>,
    pub settings: Option<UserSettings>,
}

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

/// GET /api/user/profile
pub async fn get_profile(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<UserResponse>, StatusCode> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM user WHERE id = ? LIMIT 1")
        .bind(&claims.sub)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(UserResponse::from_user(&user)))
}

/// PUT /api/user/profile
pub async fn update_profile(
    State(state): State<AppState>,
    claims: Claims,
    Json(body): Json<UpdateProfileRequest>,
) -> Result<Json<UserResponse>, StatusCode> {
    let mut user = sqlx::query_as::<_, User>("SELECT * FROM user WHERE id = ? LIMIT 1")
        .bind(&claims.sub)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if let Some(ref name) = body.name {
        user.name = name.clone();
    }
    if let Some(ref avatar) = body.avatar {
        user.avatar = Some(avatar.clone());
    }
    if let Some(ref settings) = body.settings {
        user.settings.0 = settings.clone();
    }

    let settings_json = serde_json::to_string(&user.settings.0)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    sqlx::query("UPDATE user SET name = ?, avatar = ?, settings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&user.name)
        .bind(&user.avatar)
        .bind(&settings_json)
        .bind(&user.id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let updated_user = sqlx::query_as::<_, User>("SELECT * FROM user WHERE id = ? LIMIT 1")
        .bind(&claims.sub)
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(UserResponse::from_user(&updated_user)))
}

/// PUT /api/user/password
///
/// When encryption is enabled, this endpoint also:
/// 1. Derives old KEK → unwraps Master Key
/// 2. Generates new salt → derives new KEK → re-wraps Master Key
/// 3. Issues new JWT + cookie with re-sealed master key
pub async fn change_password(
    State(state): State<AppState>,
    claims: Claims,
    Json(body): Json<ChangePasswordRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM user WHERE id = ? LIMIT 1")
        .bind(&claims.sub)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let valid = password::verify_password(&body.current_password, &user.password_hash)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if !valid {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let new_hash = password::hash_password(&body.new_password)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Re-wrap master key if encryption is enabled
    let sealed_mk = if user.encryption_enabled {
        match (&user.encrypted_master_key, &user.encryption_salt) {
            (Some(emk), Some(salt)) => {
                // Derive old KEK → unwrap master key
                let old_salt = crypto::base64_decode(salt)
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                let old_kek = crypto::derive_kek(&body.current_password, &old_salt)
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                let wrapped = crypto::base64_decode(emk)
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                let mk = crypto::unwrap_master_key(&wrapped, &old_kek)
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

                // Generate new salt → derive new KEK → re-wrap
                let new_salt = crypto::generate_salt();
                let new_kek = crypto::derive_kek(&body.new_password, &new_salt)
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                let new_wrapped = crypto::wrap_master_key(&mk, &new_kek)
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

                // Update DB with new password hash + re-wrapped key
                sqlx::query(
                    "UPDATE user SET password_hash = ?, encrypted_master_key = ?, encryption_salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                )
                .bind(&new_hash)
                .bind(&crypto::base64_encode(&new_wrapped))
                .bind(&crypto::base64_encode(&new_salt))
                .bind(&user.id)
                .execute(&state.db)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

                let sealed = crypto::seal_master_key(&mk, &state.config.jwt_secret, &user.id)
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                Some(sealed)
            }
            _ => {
                // Just update password hash
                sqlx::query("UPDATE user SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                    .bind(&new_hash)
                    .bind(&user.id)
                    .execute(&state.db)
                    .await
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                None
            }
        }
    } else {
        // No encryption — just update password hash
        sqlx::query("UPDATE user SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(&new_hash)
            .bind(&user.id)
            .execute(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        None
    };

    // Issue new JWT + cookie
    let new_token = jwt::create_token_with_mk(
        &user.id,
        &user.email,
        &user.role,
        &state.config.jwt_secret,
        sealed_mk.as_deref(),
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut response = Json(serde_json::json!({ "token": new_token })).into_response();

    if let Some(ref mk) = sealed_mk {
        if let Some(cookie) = auth_routes::encryption_cookie(mk) {
            response.headers_mut().insert(header::SET_COOKIE, cookie);
        }
    }

    Ok(response)
}

#[derive(Deserialize)]
pub struct SearchUserQuery {
    pub q: String,
}

/// GET /api/user/search
pub async fn search_users(
    State(state): State<AppState>,
    claims: Claims,
    axum::extract::Query(query): axum::extract::Query<SearchUserQuery>,
) -> Result<Json<Vec<UserResponse>>, StatusCode> {
    let q = format!("%{}%", query.q);
    let users = sqlx::query_as::<_, User>(
        "SELECT * FROM user WHERE (email LIKE ? OR name LIKE ?) AND id != ? LIMIT 10",
    )
    .bind(&q)
    .bind(&q)
    .bind(&claims.sub)
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let res = users.iter().map(|u| UserResponse::from_user(u)).collect();
    Ok(Json(res))
}
