use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::json;
use crate::state::AppState;

/// GET /api/health — Health check endpoint.
pub async fn health_check(State(state): State<AppState>) -> impl IntoResponse {
    let index = state.cache.index();
    let total_files = index.len().await;
    let total_size = index.total_size_bytes().await;

    (
        StatusCode::OK,
        Json(json!({
            "status": "healthy",
            "total_files": total_files,
            "total_size_bytes": total_size,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    )
}

/// GET /api/stats — Cache and sync statistics.
pub async fn stats(State(state): State<AppState>) -> impl IntoResponse {
    let index = state.cache.index();
    let total_files = index.len().await;
    let total_size = index.total_size_bytes().await;

    let cached = index
        .list_by_status(&cloudstore_common::FileStatus::Cached)
        .await
        .len();
    let syncing = index
        .list_by_status(&cloudstore_common::FileStatus::Syncing)
        .await
        .len();
    let synced = index
        .list_by_status(&cloudstore_common::FileStatus::Synced)
        .await
        .len();
    let failed = index
        .list_by_status(&cloudstore_common::FileStatus::SyncFailed)
        .await
        .len();

    Json(json!({
        "total_files": total_files,
        "total_size_bytes": total_size,
        "by_status": {
            "cached": cached,
            "syncing": syncing,
            "synced": synced,
            "sync_failed": failed,
        },
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

/// GET /metrics — Prometheus-compatible metrics endpoint.
pub async fn prometheus_metrics(State(state): State<AppState>) -> impl IntoResponse {
    let body = state.metrics.to_prometheus();
    (
        StatusCode::OK,
        [("content-type", "text/plain; version=0.0.4; charset=utf-8")],
        body,
    )
}
