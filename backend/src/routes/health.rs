use axum::{extract::State, http::StatusCode, Json};
use serde::Serialize;
use std::time::Instant;

use crate::AppState;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub uptime_seconds: u64,
    pub version: String,
    pub db_status: String,
    pub storage_status: String,
}

#[derive(Serialize)]
pub struct SystemStats {
    pub total_users: usize,
    pub total_media: usize,
    pub total_albums: usize,
    pub total_shares: usize,
    pub total_storage_bytes: f64,
    pub media_by_type: MediaTypeStats,
}

#[derive(Serialize)]
pub struct MediaTypeStats {
    pub images: usize,
    pub videos: usize,
    pub other: usize,
}

static mut START_TIME: Option<Instant> = None;

pub fn init_uptime() {
    unsafe { START_TIME = Some(Instant::now()); }
}

fn get_uptime() -> u64 {
    unsafe { START_TIME.map(|t| t.elapsed().as_secs()).unwrap_or(0) }
}

/// GET /api/health
pub async fn health_check(
    State(state): State<AppState>,
) -> Json<HealthResponse> {
    // Quick DB check
    let db_ok = sqlx::query("SELECT 1").execute(&state.db).await.is_ok();

    Json(HealthResponse {
        status: if db_ok { "healthy" } else { "degraded" }.into(),
        uptime_seconds: get_uptime(),
        version: env!("CARGO_PKG_VERSION").into(),
        db_status: if db_ok { "connected" } else { "error" }.into(),
        storage_status: "ok".into(),
    })
}

/// GET /api/stats
pub async fn system_stats(
    State(state): State<AppState>,
) -> Result<Json<SystemStats>, StatusCode> {
    let users: i64 = sqlx::query_scalar("SELECT COUNT(id) FROM user").fetch_one(&state.db).await.unwrap_or(0);
    let media: i64 = sqlx::query_scalar("SELECT COUNT(id) FROM media WHERE deleted_at IS NULL").fetch_one(&state.db).await.unwrap_or(0);
    let albums: i64 = sqlx::query_scalar("SELECT COUNT(id) FROM album").fetch_one(&state.db).await.unwrap_or(0);
    let shares: i64 = sqlx::query_scalar("SELECT COUNT(id) FROM shared_link WHERE is_active = 1").fetch_one(&state.db).await.unwrap_or(0);
    let storage_opt: Option<f64> = sqlx::query_scalar("SELECT SUM(storage_used) FROM user").fetch_one(&state.db).await.unwrap_or(Some(0.0));
    let storage = storage_opt.unwrap_or(0.0);
    
    let images: i64 = sqlx::query_scalar("SELECT COUNT(id) FROM media WHERE mime_type LIKE '%image%' AND deleted_at IS NULL").fetch_one(&state.db).await.unwrap_or(0);
    let videos: i64 = sqlx::query_scalar("SELECT COUNT(id) FROM media WHERE mime_type LIKE '%video%' AND deleted_at IS NULL").fetch_one(&state.db).await.unwrap_or(0);

    let img_count = images as usize;
    let vid_count = videos as usize;
    let total_media = media as usize;

    Ok(Json(SystemStats {
        total_users: users as usize,
        total_media,
        total_albums: albums as usize,
        total_shares: shares as usize,
        total_storage_bytes: storage,
        media_by_type: MediaTypeStats {
            images: img_count,
            videos: vid_count,
            other: total_media.saturating_sub(img_count + vid_count),
        },
    }))
}
