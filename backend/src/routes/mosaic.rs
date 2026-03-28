use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::auth::jwt::Claims;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct TimelineGroup {
    pub year: i64,
    pub month: i64,
    pub count: i64,
    pub thumbnails: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct TimelineResponse {
    pub groups: Vec<TimelineGroup>,
    pub total: i64,
}

/// GET /api/media/timeline
/// Returns media grouped by year/month with counts and sample thumbnails.
/// Uses two queries: one for grouping, one for fetching sample thumbnails per group.
pub async fn get_timeline(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<TimelineResponse>, StatusCode> {
    let user_id = claims.sub.clone();

    #[derive(sqlx::FromRow)]
    struct GroupRow {
        year: i64,
        month: i64,
        count: i64,
    }

    // Step 1: Get year/month groups with counts
    let group_rows: Vec<GroupRow> = sqlx::query_as(
        "SELECT 
            CAST(strftime('%Y', created_at) AS INTEGER) AS year,
            CAST(strftime('%m', created_at) AS INTEGER) AS month,
            COUNT(id) AS count
         FROM media
         WHERE user_id = ? AND status = 'ready' AND deleted_at IS NULL
         GROUP BY year, month
         ORDER BY year DESC, month DESC"
    )
    .bind(&user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Timeline group query failed: {:?}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Step 2: For each group, fetch up to 4 thumbnails
    let mut groups: Vec<TimelineGroup> = Vec::new();
    for row in &group_rows {
        let thumbs: Vec<String> = sqlx::query_scalar(
            "SELECT json_extract(thumbnails, '$.small') FROM media
             WHERE user_id = ? 
               AND status = 'ready' 
               AND deleted_at IS NULL 
               AND json_extract(thumbnails, '$.small') IS NOT NULL
               AND CAST(strftime('%Y', created_at) AS INTEGER) = ?
               AND CAST(strftime('%m', created_at) AS INTEGER) = ?
             ORDER BY created_at DESC
             LIMIT 4"
        )
        .bind(&user_id)
        .bind(row.year)
        .bind(row.month)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        groups.push(TimelineGroup {
            year: row.year,
            month: row.month,
            count: row.count,
            thumbnails: thumbs,
        });
    }

    let total: i64 = groups.iter().map(|g| g.count).sum();

    Ok(Json(TimelineResponse { groups, total }))
}
