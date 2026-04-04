use axum::http::header;
use axum::response::IntoResponse;
use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};

use crate::auth::jwt::{self, Claims};
use crate::auth::password;
use crate::crypto;
use crate::models::user::User;
use crate::routes::auth;
use crate::AppState;

// === Request/Response types ===

#[derive(Deserialize)]
pub struct EnableEncryptionRequest {
    pub password: String,
}

#[derive(Serialize)]
pub struct EnableEncryptionResponse {
    pub enabled: bool,
    pub recovery_key: String,
    pub token: String,
}

#[derive(Deserialize)]
pub struct DisableEncryptionRequest {
    pub password: String,
}

#[derive(Serialize)]
pub struct EncryptionStatusResponse {
    pub enabled: bool,
}

#[derive(Deserialize)]
pub struct RecoverRequest {
    pub recovery_key: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct RecoverResponse {
    pub recovered: bool,
    pub token: String,
}

// === Handlers ===

/// POST /api/encryption/enable
pub async fn enable_encryption(
    State(state): State<AppState>,
    claims: Claims,
    Json(body): Json<EnableEncryptionRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let user = get_user(&state, &claims.sub).await?;

    if user.encryption_enabled {
        return Err(StatusCode::CONFLICT); // Already enabled
    }

    // Verify password
    let valid = password::verify_password(&body.password, &user.password_hash)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if !valid {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Generate encryption keys
    let salt = crypto::generate_salt();
    let kek = crypto::derive_kek(&body.password, &salt)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let master_key = crypto::generate_master_key();
    let wrapped = crypto::wrap_master_key(&master_key, &kek)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let recovery_key = crypto::encode_recovery_key(&master_key);

    // Save to DB
    sqlx::query(
        "UPDATE user SET encrypted_master_key = ?, encryption_salt = ?, encryption_enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .bind(&crypto::base64_encode(&wrapped))
    .bind(&crypto::base64_encode(&salt))
    .bind(&user.id)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Issue new JWT with sealed master key
    let sealed_mk = crypto::seal_master_key(&master_key, &state.config.jwt_secret, &user.id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let token = jwt::create_token_with_mk(
        &user.id,
        &user.email,
        &user.role,
        &state.config.jwt_secret,
        Some(&sealed_mk),
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let resp = EnableEncryptionResponse {
        enabled: true,
        recovery_key,
        token,
    };

    let mut response = Json(resp).into_response();
    if let Some(cookie) = auth::encryption_cookie(&sealed_mk) {
        response.headers_mut().insert(header::SET_COOKIE, cookie);
    }

    Ok(response)
}

/// POST /api/encryption/disable
pub async fn disable_encryption(
    State(state): State<AppState>,
    claims: Claims,
    Json(body): Json<DisableEncryptionRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let user = get_user(&state, &claims.sub).await?;

    if !user.encryption_enabled {
        return Err(StatusCode::BAD_REQUEST); // Not enabled
    }

    // Verify password
    let valid = password::verify_password(&body.password, &user.password_hash)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if !valid {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Clear encryption fields
    sqlx::query(
        "UPDATE user SET encrypted_master_key = NULL, encryption_salt = NULL, encryption_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .bind(&user.id)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Issue new JWT without master key
    let token = jwt::create_token(&user.id, &user.email, &user.role, &state.config.jwt_secret)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut response = Json(serde_json::json!({
        "enabled": false,
        "token": token
    }))
    .into_response();

    // Clear the encryption cookie
    response
        .headers_mut()
        .insert(header::SET_COOKIE, auth::clear_encryption_cookie());

    Ok(response)
}

/// GET /api/encryption/status
pub async fn encryption_status(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<EncryptionStatusResponse>, StatusCode> {
    let user = get_user(&state, &claims.sub).await?;
    Ok(Json(EncryptionStatusResponse {
        enabled: user.encryption_enabled,
    }))
}

/// POST /api/encryption/recover
/// Used when user forgot old password, admin reset it, and user needs to restore encryption
/// using their recovery key.
pub async fn recover_encryption(
    State(state): State<AppState>,
    claims: Claims,
    Json(body): Json<RecoverRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let user = get_user(&state, &claims.sub).await?;

    if !user.encryption_enabled {
        return Err(StatusCode::BAD_REQUEST); // Encryption not enabled
    }

    // Verify current password
    let valid = password::verify_password(&body.password, &user.password_hash)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if !valid {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Decode recovery key → Master Key
    let master_key = crypto::decode_recovery_key(&body.recovery_key)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    // Generate new salt and re-wrap with current password
    let new_salt = crypto::generate_salt();
    let new_kek = crypto::derive_kek(&body.password, &new_salt)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let new_wrapped = crypto::wrap_master_key(&master_key, &new_kek)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Update DB
    sqlx::query(
        "UPDATE user SET encrypted_master_key = ?, encryption_salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
    .bind(&crypto::base64_encode(&new_wrapped))
    .bind(&crypto::base64_encode(&new_salt))
    .bind(&user.id)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Issue new JWT + cookie with sealed master key
    let sealed_mk = crypto::seal_master_key(&master_key, &state.config.jwt_secret, &user.id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let token = jwt::create_token_with_mk(
        &user.id,
        &user.email,
        &user.role,
        &state.config.jwt_secret,
        Some(&sealed_mk),
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let resp = RecoverResponse {
        recovered: true,
        token,
    };

    let mut response = Json(resp).into_response();
    if let Some(cookie) = auth::encryption_cookie(&sealed_mk) {
        response.headers_mut().insert(header::SET_COOKIE, cookie);
    }

    Ok(response)
}

// === Helpers ===

async fn get_user(state: &AppState, user_id: &str) -> Result<User, StatusCode> {
    sqlx::query_as::<_, User>("SELECT * FROM user WHERE id = ? LIMIT 1")
        .bind(user_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)
}
