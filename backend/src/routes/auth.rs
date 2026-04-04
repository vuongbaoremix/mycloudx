use axum::http::header;
use axum::response::IntoResponse;
use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};

use crate::auth::{jwt, password};
use crate::crypto;
use crate::models::user::{User, UserResponse};
use crate::AppState;

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserResponse,
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub name: String,
    pub email: String,
    pub password: String,
}

/// POST /api/auth/login
pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let email = body.email.clone();
    let user = sqlx::query_as::<_, User>("SELECT * FROM user WHERE email = ? LIMIT 1")
        .bind(email)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("DB error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let valid = password::verify_password(&body.password, &user.password_hash)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if !valid {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // If encryption is enabled, derive KEK → unwrap master key → seal for JWT/cookie
    let sealed_mk = if user.encryption_enabled {
        match (&user.encrypted_master_key, &user.encryption_salt) {
            (Some(emk), Some(salt)) => {
                let salt_bytes = crypto::base64_decode(salt)
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                let kek = crypto::derive_kek(&body.password, &salt_bytes)
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                let wrapped = crypto::base64_decode(emk)
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                let mk_result = crypto::unwrap_master_key(&wrapped, &kek);
                match mk_result {
                    Ok(mk) => {
                        let sealed = crypto::seal_master_key(&mk, &state.config.jwt_secret, &user.id)
                            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                        Some(sealed)
                    }
                    Err(e) => {
                        tracing::warn!("Failed to unwrap master key for user {}: {}", user.id, e);
                        // Do not fail the login; just return `None` for `sealed_mk`.
                        // The user will see their data is locked and will need to use the Recovery Key.
                        None
                    }
                }
            }
            _ => None,
        }
    } else {
        None
    };

    let token = jwt::create_token_with_mk(
        &user.id,
        &user.email,
        &user.role,
        &state.config.jwt_secret,
        sealed_mk.as_deref(),
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let auth_resp = AuthResponse {
        token: token.clone(),
        user: UserResponse::from_user(&user),
    };

    let mut response = Json(auth_resp).into_response();

    // Set HttpOnly cookies for serve_file (public endpoint, used by <img> tags)
    if let Ok(cookie_jwt) = header::HeaderValue::from_str(&format!(
        "__mc={}; HttpOnly; SameSite=Strict; Path=/api/media; Max-Age=2592000",
        token
    )) {
        response.headers_mut().append(header::SET_COOKIE, cookie_jwt);
    }

    if let Some(ref mk) = sealed_mk {
        if let Ok(cookie_val) = header::HeaderValue::from_str(&format!(
            "__mc_mk={}; HttpOnly; SameSite=Strict; Path=/api/media; Max-Age=2592000",
            mk
        )) {
            response.headers_mut().append(header::SET_COOKIE, cookie_val);
        }
    } else {
        response.headers_mut().append(header::SET_COOKIE, clear_encryption_cookie());
    }

    Ok(response)
}

/// POST /api/auth/register
pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let email = body.email.clone();
    let existing = sqlx::query_as::<_, User>("SELECT * FROM user WHERE email = ? LIMIT 1")
        .bind(&email)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if existing.is_some() {
        return Err(StatusCode::CONFLICT);
    }

    let password_hash = password::hash_password(&body.password)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let user_id = uuid::Uuid::new_v4().to_string();
    let default_settings = r#"{"theme":"system","language":"vi","gallery_columns":4}"#;

    sqlx::query(
        "INSERT INTO user (id, name, email, password_hash, role, storage_used, storage_quota, settings) 
         VALUES (?, ?, ?, ?, 'user', 0.0, 1099511627776.0, ?)"
    )
    .bind(&user_id)
    .bind(&body.name)
    .bind(&body.email)
    .bind(&password_hash)
    .bind(default_settings)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Insert error: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let user = sqlx::query_as::<_, User>("SELECT * FROM user WHERE id = ?")
        .bind(&user_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let token = jwt::create_token(&user.id, &user.email, &user.role, &state.config.jwt_secret)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut response = Json(AuthResponse {
        token: token.clone(),
        user: UserResponse::from_user(&user),
    }).into_response();

    if let Ok(cookie_jwt) = header::HeaderValue::from_str(&format!(
        "__mc={}; HttpOnly; SameSite=Strict; Path=/api/media; Max-Age=2592000",
        token
    )) {
        response.headers_mut().append(header::SET_COOKIE, cookie_jwt);
    }

    Ok(response)
}

#[derive(Serialize)]
pub struct DownloadTokenResponse {
    pub token: String,
}

/// GET /api/auth/download-token
pub async fn get_download_token(
    State(state): State<AppState>,
    claims: crate::auth::jwt::Claims,
) -> Result<Json<DownloadTokenResponse>, StatusCode> {
    let token = crate::auth::jwt::create_download_token(&claims.sub, &state.config.jwt_secret, claims.encrypted_mk.as_deref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(DownloadTokenResponse { token }))
}

/// Helper to build the Set-Cookie header for clearing the encryption cookie
pub fn clear_encryption_cookie() -> header::HeaderValue {
    header::HeaderValue::from_static(
        "__mc_mk=; HttpOnly; SameSite=Strict; Path=/api/media; Max-Age=0"
    )
}

/// Helper to build the Set-Cookie header for the encryption cookie
pub fn encryption_cookie(sealed_mk: &str) -> Option<header::HeaderValue> {
    header::HeaderValue::from_str(&format!(
        "__mc_mk={}; HttpOnly; SameSite=Strict; Path=/api/media; Max-Age=2592000",
        sealed_mk
    ))
    .ok()
}
