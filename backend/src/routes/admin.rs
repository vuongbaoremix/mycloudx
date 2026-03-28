use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::auth::jwt::Claims;
use crate::auth::password;
use crate::models::user::{User, UserResponse};
use crate::metrics::ServerMetrics;
use crate::AppState;

#[derive(Serialize)]
pub struct StatsResponse {
    pub total_users: usize,
    pub total_media: usize,
    pub total_storage_bytes: f64,
    pub total_albums: usize,
}

#[derive(Serialize)]
pub struct DashboardResponse {
    pub backend_stats: StatsResponse,
    pub server_metrics: ServerMetrics,
    pub cloudstore_health: Option<serde_json::Value>,
    pub cloudstore_stats: Option<serde_json::Value>,
    pub cloudstore_metrics: Option<String>,
}

#[derive(Deserialize)]
pub struct AdminUserUpdate {
    pub role: Option<String>,
    pub storage_quota: Option<f64>,
    pub name: Option<String>,
}

/// GET /api/admin/stats
pub async fn get_stats(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<StatsResponse>, StatusCode> {
    if claims.role != "admin" {
        return Err(StatusCode::FORBIDDEN);
    }

    let users: i64 = sqlx::query_scalar("SELECT COUNT(id) FROM user").fetch_one(&state.db).await.unwrap_or(0);
    let media: i64 = sqlx::query_scalar("SELECT COUNT(id) FROM media WHERE deleted_at IS NULL").fetch_one(&state.db).await.unwrap_or(0);
    let storage_opt: Option<f64> = sqlx::query_scalar("SELECT SUM(storage_used) FROM user").fetch_one(&state.db).await.unwrap_or(Some(0.0));
    let albums: i64 = sqlx::query_scalar("SELECT COUNT(id) FROM album").fetch_one(&state.db).await.unwrap_or(0);

    Ok(Json(StatsResponse {
        total_users: users as usize,
        total_media: media as usize,
        total_storage_bytes: storage_opt.unwrap_or(0.0),
        total_albums: albums as usize,
    }))
}

/// GET /api/admin/dashboard
pub async fn get_dashboard(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<DashboardResponse>, StatusCode> {
    if claims.role != "admin" {
        return Err(StatusCode::FORBIDDEN);
    }

    let backend_stats = get_stats(State(state.clone()), claims).await?.0;
    let server_metrics = state.metrics.snapshot().await;
    
    let mut cloudstore_health = None;
    let mut cloudstore_stats = None;
    let mut cloudstore_metrics = None;

    if let Some(cloudstore_url) = &state.config.cloudstore_url {
        let client = reqwest::Client::new();
        
        let health_url = format!("{}/api/health", cloudstore_url);
        if let Ok(res) = client.get(&health_url).send().await {
            if let Ok(json) = res.json::<serde_json::Value>().await {
                cloudstore_health = Some(json);
            }
        }

        let stats_url = format!("{}/api/stats", cloudstore_url);
        // Note: the cloudstore /api/stats endpoint requires authentication if CLOUDSTORE_API_KEY is configured.
        let mut req = client.get(&stats_url);
        if let Some(api_key) = &state.config.cloudstore_api_key {
            req = req.header("X-API-Key", api_key);
        }
        if let Ok(res) = req.send().await {
            if let Ok(json) = res.json::<serde_json::Value>().await {
                cloudstore_stats = Some(json);
            }
        }

        let metrics_url = format!("{}/metrics", cloudstore_url);
        if let Ok(res) = client.get(&metrics_url).send().await {
            if let Ok(text) = res.text().await {
                cloudstore_metrics = Some(text);
            }
        }
    }

    Ok(Json(DashboardResponse {
        backend_stats,
        server_metrics,
        cloudstore_health,
        cloudstore_stats,
        cloudstore_metrics,
    }))
}

/// GET /api/admin/users
pub async fn list_users(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<UserResponse>>, StatusCode> {
    if claims.role != "admin" {
        return Err(StatusCode::FORBIDDEN);
    }

    let users: Vec<User> = sqlx::query_as("SELECT * FROM user ORDER BY created_at DESC")
        .fetch_all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let resp: Vec<UserResponse> = users.iter().map(UserResponse::from_user).collect();
    Ok(Json(resp))
}

/// PUT /api/admin/users/:id
pub async fn update_user(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
    Json(body): Json<AdminUserUpdate>,
) -> Result<Json<UserResponse>, StatusCode> {
    if claims.role != "admin" {
        return Err(StatusCode::FORBIDDEN);
    }

    let mut q = sqlx::QueryBuilder::<sqlx::sqlite::Sqlite>::new("UPDATE user SET updated_at = CURRENT_TIMESTAMP");

    if let Some(ref role) = body.role {
        q.push(", role = ");
        q.push_bind(role);
    }
    if let Some(quota) = body.storage_quota {
        q.push(", storage_quota = ");
        q.push_bind(quota);
    }
    if let Some(ref name) = body.name {
        q.push(", name = ");
        q.push_bind(name);
    }

    q.push(" WHERE id = ");
    q.push_bind(&id);

    q.build().execute(&state.db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let user: User = sqlx::query_as("SELECT * FROM user WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(UserResponse::from_user(&user)))
}

/// DELETE /api/admin/users/:id
pub async fn delete_user(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    if claims.role != "admin" {
        return Err(StatusCode::FORBIDDEN);
    }

    // Prevent self-deletion
    if claims.sub == id {
        return Err(StatusCode::BAD_REQUEST);
    }

    sqlx::query("DELETE FROM user WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/admin/users/:id/reset-password
pub async fn reset_user_password(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if claims.role != "admin" {
        return Err(StatusCode::FORBIDDEN);
    }

    let new_password = "Reset@123456";
    let new_hash = password::hash_password(new_password)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    sqlx::query("UPDATE user SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&new_hash)
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::json!({
        "message": "Password reset successfully",
        "new_password": new_password
    })))
}
