use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use crate::auth::jwt::Claims;
use crate::models::media::{Media, MediaResponse};
use crate::AppState;

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

#[derive(serde::Serialize)]
pub struct SearchResponse {
    pub items: Vec<MediaResponse>,
    pub total: usize,
    pub query: String,
}

/// GET /api/search
pub async fn search_media(
    State(state): State<AppState>,
    claims: Claims,
    Query(query): Query<SearchQuery>,
) -> Result<Json<SearchResponse>, StatusCode> {
    let limit = query.limit.unwrap_or(50);
    let offset = (query.page.unwrap_or(1).saturating_sub(1)) * limit;
    let user_id = claims.sub.clone();
    let search_term = query.q.clone();
    let term_like = format!("%{}%", search_term);

    let base_where = "user_id = ? AND deleted_at IS NULL AND \
        (LOWER(original_name) LIKE LOWER(?) OR \
         LOWER(filename) LIKE LOWER(?) OR \
         json_extract(metadata, '$.camera_make') LIKE ? OR \
         json_extract(metadata, '$.camera_model') LIKE ?)";

    let q = format!("SELECT * FROM media WHERE {} ORDER BY created_at DESC LIMIT ? OFFSET ?", base_where);
    let count_q = format!("SELECT COUNT(id) FROM media WHERE {}", base_where);

    let count: i64 = sqlx::query_scalar(&count_q)
        .bind(&user_id)
        .bind(&term_like)
        .bind(&term_like)
        .bind(&term_like)
        .bind(&term_like)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

    let items: Vec<Media> = sqlx::query_as(&q)
        .bind(&user_id)
        .bind(&term_like)
        .bind(&term_like)
        .bind(&term_like)
        .bind(&term_like)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let resp_items: Vec<MediaResponse> = items.iter().map(MediaResponse::from_media).collect();

    Ok(Json(SearchResponse {
        total: count as usize,
        items: resp_items,
        query: search_term,
    }))
}
