use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};

use crate::auth::{jwt, password};
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
) -> Result<Json<AuthResponse>, StatusCode> {
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

    let token = jwt::create_token(&user.id, &user.email, &user.role, &state.config.jwt_secret)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(AuthResponse {
        token,
        user: UserResponse::from_user(&user),
    }))
}

/// POST /api/auth/register
pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, StatusCode> {
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
         VALUES (?, ?, ?, ?, 'user', 0.0, 10737418240.0, ?)"
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

    Ok(Json(AuthResponse {
        token,
        user: UserResponse::from_user(&user),
    }))
}
