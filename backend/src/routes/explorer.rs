use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::Serialize;

use crate::auth::jwt::Claims;
use crate::models::media::{Media, MediaResponse};
use crate::AppState;

#[derive(Serialize)]
pub struct ExplorerStatsResponse {
    pub total_files: i64,
    pub total_size: f64,
    pub video_count: i64,
}

/// GET /api/explorer/memories
/// Trả về tối đa 50 ảnh chụp cùng ngày và tháng nhưng khác năm
pub async fn get_memories(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<MediaResponse>>, StatusCode> {
    let items = sqlx::query_as::<_, Media>(
        "SELECT * FROM media 
        WHERE user_id = ? 
        AND strftime('%m-%d', COALESCE(json_extract(metadata, '$.taken_at'), created_at)) = strftime('%m-%d', 'now', 'localtime') 
        AND strftime('%Y', COALESCE(json_extract(metadata, '$.taken_at'), created_at)) < strftime('%Y', 'now', 'localtime') 
        AND deleted_at IS NULL 
        AND status = 'ready'
        ORDER BY COALESCE(json_extract(metadata, '$.taken_at'), created_at) DESC
        LIMIT 50"
    )
    .bind(&claims.sub)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error in get_memories: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let resp: Vec<MediaResponse> = items.iter().map(MediaResponse::from_media).collect();
    Ok(Json(resp))
}

/// GET /api/explorer/screenshots
/// Trả về các ảnh chụp màn hình (tối đa 50) để hiển thị Khám phá
pub async fn get_screenshots(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<MediaResponse>>, StatusCode> {
    // Thông thường ảnh chụp màn hình điện thoại sẽ bắt đầu bằng "Screenshot_" (Android) hoặc có định dạng PNG (iOS)
    let items = sqlx::query_as::<_, Media>(
        "SELECT * FROM media 
        WHERE user_id = ? 
        AND (original_name LIKE '%Screenshot%' OR mime_type = 'image/png')
        AND deleted_at IS NULL 
        AND status = 'ready'
        ORDER BY created_at DESC
        LIMIT 50"
    )
    .bind(&claims.sub)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error in get_screenshots: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let resp: Vec<MediaResponse> = items.iter().map(MediaResponse::from_media).collect();
    Ok(Json(resp))
}

/// GET /api/explorer/stats
/// Trả về thống kê lưu trữ cá nhân
pub async fn get_stats(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<ExplorerStatsResponse>, StatusCode> {
    #[derive(sqlx::FromRow)]
    struct StatsRow {
        total_files: i64,
        total_size: f64,
        video_count: Option<i64>,
    }

    let stats = sqlx::query_as::<_, StatsRow>(
        r#"
        SELECT 
            CAST(COUNT(id) AS INTEGER) as total_files, 
            CAST(COALESCE(SUM(size), 0.0) AS REAL) as total_size, 
            CAST(SUM(CASE WHEN mime_type LIKE 'video/%' THEN 1 ELSE 0 END) AS INTEGER) as video_count
        FROM media 
        WHERE user_id = ? AND deleted_at IS NULL AND status = 'ready'
        "#
    )
    .bind(&claims.sub)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error in get_stats: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(ExplorerStatsResponse {
        total_files: stats.total_files,
        total_size: stats.total_size,
        video_count: stats.video_count.unwrap_or(0),
    }))
}
