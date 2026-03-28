use axum::{extract::State, http::StatusCode, Json};
use serde::Deserialize;

use crate::auth::jwt::Claims;
use crate::auth::password;
use crate::models::user::{User, UserResponse, UserSettings};
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
pub async fn change_password(
    State(state): State<AppState>,
    claims: Claims,
    Json(body): Json<ChangePasswordRequest>,
) -> Result<StatusCode, StatusCode> {
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

    sqlx::query("UPDATE user SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&new_hash)
        .bind(&user.id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}
