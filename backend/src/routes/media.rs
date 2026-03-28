use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, sqlite::Sqlite};

use crate::auth::jwt::Claims;
use crate::models::media::{Media, MediaResponse};
use crate::AppState;

#[derive(Deserialize)]
pub struct MediaQuery {
    pub page: Option<u32>,
    pub limit: Option<u32>,
    pub sort: Option<String>,
    pub mime_type: Option<String>,
    pub favorite: Option<bool>,
    pub trash: Option<bool>,
    pub year: Option<i64>,
    pub month: Option<i64>,
}

#[derive(Serialize)]
pub struct MediaListResponse {
    pub items: Vec<MediaResponse>,
    pub total: usize,
    pub page: u32,
    pub limit: u32,
}

/// GET /api/media
pub async fn list_media(
    State(state): State<AppState>,
    claims: Claims,
    Query(query): Query<MediaQuery>,
) -> Result<Json<MediaListResponse>, StatusCode> {
    let page = query.page.unwrap_or(1);
    let limit = query.limit.unwrap_or(50);
    let offset = (page - 1) * limit;
    let user_id = claims.sub.clone();

    let mut q = QueryBuilder::<Sqlite>::new("SELECT * FROM media ");
    let mut count_q = QueryBuilder::<Sqlite>::new("SELECT COUNT(id) FROM media ");

    let build_where = |q_b: &mut QueryBuilder<Sqlite>| {
        q_b.push("WHERE user_id = ");
        q_b.push_bind(user_id.clone());

        if let Some(true) = query.trash {
            q_b.push(" AND deleted_at IS NOT NULL");
        } else {
            q_b.push(" AND deleted_at IS NULL AND status = 'ready'");
        }

        if let Some(true) = query.favorite {
            q_b.push(" AND is_favorite = 1");
        }

        if let Some(ref mime) = query.mime_type {
            q_b.push(" AND mime_type LIKE ");
            q_b.push_bind(format!("%{}%", mime));
        }

        if let Some(y) = query.year {
            q_b.push(" AND strftime('%Y', created_at) = ");
            q_b.push_bind(format!("{:04}", y));
        }

        if let Some(m) = query.month {
            q_b.push(" AND strftime('%m', created_at) = ");
            q_b.push_bind(format!("{:02}", m));
        }
    };

    build_where(&mut q);
    build_where(&mut count_q);

    match query.sort.as_deref() {
        Some("name") => q.push(" ORDER BY original_name ASC"),
        Some("size") => q.push(" ORDER BY size DESC"),
        _ => q.push(" ORDER BY created_at DESC"),
    };

    q.push(" LIMIT ");
    q.push_bind(limit as i64);
    q.push(" OFFSET ");
    q.push_bind(offset as i64);

    let items: Vec<Media> = q.build_query_as()
        .fetch_all(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("DB error in list_media: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let total: i64 = count_q.build_query_scalar()
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or(0);

    let resp_items: Vec<MediaResponse> = items.iter().map(MediaResponse::from_media).collect();
    Ok(Json(MediaListResponse { items: resp_items, total: total as usize, page, limit }))
}

/// GET /api/media/:id
pub async fn get_media(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
) -> Result<Json<MediaResponse>, StatusCode> {
    let media = sqlx::query_as::<_, Media>("SELECT * FROM media WHERE id = ? AND user_id = ? LIMIT 1")
        .bind(&id)
        .bind(&claims.sub)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(MediaResponse::from_media(&media)))
}

/// DELETE /api/media/:id
pub async fn delete_media(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    sqlx::query("UPDATE media SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&claims.sub)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

/// PUT /api/media/:id/favorite
pub async fn toggle_favorite(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
) -> Result<Json<MediaResponse>, StatusCode> {
    let media = sqlx::query_as::<_, Media>("SELECT * FROM media WHERE id = ? AND user_id = ? LIMIT 1")
        .bind(&id)
        .bind(&claims.sub)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let new_fav = if media.is_favorite { 0 } else { 1 };

    sqlx::query("UPDATE media SET is_favorite = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .bind(new_fav)
        .bind(&id)
        .bind(&claims.sub)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let updated_media = sqlx::query_as::<_, Media>("SELECT * FROM media WHERE id = ? LIMIT 1")
        .bind(&id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(MediaResponse::from_media(&updated_media)))
}

/// POST /api/media/:id/restore
pub async fn restore_media(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    sqlx::query("UPDATE media SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&claims.sub)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/media/serve/:path
pub async fn serve_file(
    State(state): State<AppState>,
    Path(file_path): Path<String>,
    req: axum::extract::Request,
) -> Result<axum::response::Response, StatusCode> {
    let decoded = urlencoding::decode(&file_path).unwrap_or_default().to_string();
    
    // Efficient local file streaming with Range support
    if let Some(local_path) = state.storage.get_local_path(&decoded) {
        use tower::ServiceExt;
        use tower_http::services::ServeFile;
        
        let mut res = ServeFile::new(local_path)
            .oneshot(req)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .into_response();
            
        res.headers_mut().insert(
            header::CACHE_CONTROL,
            header::HeaderValue::from_static("public, max-age=31536000")
        );
        return Ok(res);
    }

    // Fallback for non-local storage
    let data = state.storage.read(&decoded).await.map_err(|_| StatusCode::NOT_FOUND)?;
    let content_type = mime_guess::from_path(&decoded)
        .first_or_octet_stream()
        .to_string();

    let mut res = axum::response::IntoResponse::into_response(data);
    res.headers_mut().insert(header::CONTENT_TYPE, header::HeaderValue::from_str(&content_type).unwrap());
    res.headers_mut().insert(header::CACHE_CONTROL, header::HeaderValue::from_static("public, max-age=31536000"));
    Ok(res)
}

/// GET /api/media/:id/download
pub async fn download_file(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
    req: axum::extract::Request,
) -> Result<axum::response::Response, StatusCode> {
    let media = sqlx::query_as::<_, Media>("SELECT * FROM media WHERE id = ? AND user_id = ? LIMIT 1")
        .bind(&id)
        .bind(&claims.sub)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Efficient local file streaming with Range support
    if let Some(local_path) = state.storage.get_local_path(&media.storage_path) {
        use tower::ServiceExt;
        use tower_http::services::ServeFile;
        
        let mut res = ServeFile::new(local_path)
            .oneshot(req)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .into_response();
            
        res.headers_mut().insert(
            header::CONTENT_DISPOSITION,
            header::HeaderValue::from_str(&format!("attachment; filename=\"{}\"", media.original_name)).unwrap()
        );
        return Ok(res);
    }

    // Fallback for non-local storage
    let data = state.storage.read(&media.storage_path).await.map_err(|_| StatusCode::NOT_FOUND)?;
    
    let mut res = axum::response::IntoResponse::into_response(data);
    res.headers_mut().insert(header::CONTENT_TYPE, header::HeaderValue::from_str(&media.mime_type).unwrap());
    res.headers_mut().insert(header::CONTENT_DISPOSITION, header::HeaderValue::from_str(&format!("attachment; filename=\"{}\"", media.original_name)).unwrap());
    Ok(res)
}

/// GET /api/media/geo
pub async fn get_geo_media(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<MediaResponse>>, StatusCode> {
    // In SQLite we can use generic json_extract or just LIKE to filter, assuming only geocoded media has location in metadata
    let items = sqlx::query_as::<_, Media>("SELECT * FROM media WHERE user_id = ? AND metadata LIKE '%\"location\":%' AND deleted_at IS NULL ORDER BY created_at DESC")
        .bind(&claims.sub)
        .fetch_all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let resp: Vec<MediaResponse> = items.iter().map(MediaResponse::from_media).collect();
    Ok(Json(resp))
}
