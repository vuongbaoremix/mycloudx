use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::auth::jwt::Claims;
use crate::models::album::Album;
use crate::models::media::Media;
use crate::AppState;

// ─── Request / Response types ───────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateAlbumRequest {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateAlbumRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub cover_media_id: Option<String>,
}

#[derive(Deserialize)]
pub struct AlbumMediaRequest {
    pub media_ids: Vec<String>,
}

#[derive(Serialize)]
pub struct AlbumResponse {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub cover_media_id: Option<String>,
    pub media_count: usize,
    pub preview_media: Vec<crate::models::media::MediaResponse>,
    pub created_at: String,
    pub updated_at: String,
}

impl AlbumResponse {
    pub fn from_album_with_details(album: &Album, media_count: usize, preview_media: Vec<crate::models::media::MediaResponse>) -> Self {
        Self {
            id: album.id.clone(),
            name: album.name.clone(),
            description: album.description.clone(),
            cover_media_id: album.cover_media_id.clone(),
            media_count,
            preview_media,
            created_at: album.created_at.to_rfc3339(),
            updated_at: album.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Serialize)]
pub struct AlbumDetailResponse {
    pub album: AlbumResponse,
    pub media: Vec<crate::models::media::MediaResponse>,
}

// ─── Helper: load album by ID and verify ownership ──────────────────────────

async fn load_album_owned(
    db: &sqlx::SqlitePool,
    album_id: &str,
    user_id: &str,
) -> Result<Album, StatusCode> {
    let album = sqlx::query_as::<_, Album>("SELECT * FROM album WHERE id = ? LIMIT 1")
        .bind(album_id)
        .fetch_optional(db)
        .await
        .map_err(|e| {
            tracing::error!("load_album_owned DB error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    if album.user_id != user_id {
        tracing::warn!(
            "Ownership mismatch: album.user_id='{}' vs claims.sub='{}'",
            album.user_id,
            user_id
        );
        return Err(StatusCode::NOT_FOUND); 
    }

    Ok(album)
}

// ─── Helper: count media in an album ────────────────────────────────────────

async fn count_album_media(db: &sqlx::SqlitePool, album_id: &str) -> usize {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(media_id) FROM album_media WHERE album_id = ?")
        .bind(album_id)
        .fetch_optional(db)
        .await
        .unwrap_or_default()
        .unwrap_or(0);
    count as usize
}

async fn fetch_album_preview_media(db: &sqlx::SqlitePool, album_id: &str) -> Vec<crate::models::media::MediaResponse> {
    let media = sqlx::query_as::<_, crate::models::media::Media>(
        "SELECT m.* FROM media m 
         INNER JOIN album_media am ON m.id = am.media_id 
         WHERE am.album_id = ? AND m.deleted_at IS NULL 
         ORDER BY m.created_at DESC LIMIT 3"
    )
    .bind(album_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();
    
    media.iter().map(crate::models::media::MediaResponse::from_media).collect()
}

// ─── Helper: fetch media_ids linked to an album ─────────────────────────────

async fn fetch_album_media_ids(db: &sqlx::SqlitePool, album_id: &str) -> Vec<String> {
    sqlx::query_scalar("SELECT media_id FROM album_media WHERE album_id = ?")
        .bind(album_id)
        .fetch_all(db)
        .await
        .unwrap_or_default()
}

// ─── GET /api/albums ────────────────────────────────────────────────────────

pub async fn list_albums(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<AlbumResponse>>, StatusCode> {
    let user_id = claims.sub.clone();
    let albums = sqlx::query_as::<_, Album>("SELECT * FROM album WHERE user_id = ? ORDER BY updated_at DESC")
        .bind(&user_id)
        .fetch_all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut responses = Vec::with_capacity(albums.len());
    for album in &albums {
        let count = count_album_media(&state.db, &album.id).await;
        let preview = fetch_album_preview_media(&state.db, &album.id).await;
        responses.push(AlbumResponse::from_album_with_details(album, count, preview));
    }
    Ok(Json(responses))
}

// ─── POST /api/albums ───────────────────────────────────────────────────────

pub async fn create_album(
    State(state): State<AppState>,
    claims: Claims,
    Json(body): Json<CreateAlbumRequest>,
) -> Result<Json<AlbumResponse>, StatusCode> {
    let album_id = uuid::Uuid::new_v4().to_string();
    
    sqlx::query("INSERT INTO album (id, user_id, name, description) VALUES (?, ?, ?, ?)")
        .bind(&album_id)
        .bind(&claims.sub)
        .bind(&body.name)
        .bind(&body.description)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let album = sqlx::query_as::<_, Album>("SELECT * FROM album WHERE id = ?")
        .bind(&album_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(AlbumResponse::from_album_with_details(&album, 0, vec![])))
}

// ─── GET /api/albums/:id ────────────────────────────────────────────────────

pub async fn get_album(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
) -> Result<Json<AlbumDetailResponse>, StatusCode> {
    let album = load_album_owned(&state.db, &id, &claims.sub).await?;

    let media_ids = fetch_album_media_ids(&state.db, &album.id).await;

    let media_items: Vec<crate::models::media::MediaResponse> = if media_ids.is_empty() {
        vec![]
    } else {
        let mut q = sqlx::QueryBuilder::<sqlx::sqlite::Sqlite>::new("SELECT * FROM media WHERE id IN (");
        let mut separated = q.separated(", ");
        for mid in &media_ids {
            separated.push_bind(mid);
        }
        separated.push_unseparated(") AND deleted_at IS NULL ORDER BY created_at DESC");

        let items: Vec<Media> = q.build_query_as()
            .fetch_all(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        items.iter().map(crate::models::media::MediaResponse::from_media).collect()
    };

    let media_count = media_items.len();
    let preview = media_items.iter().take(3).cloned().collect();
    Ok(Json(AlbumDetailResponse {
        album: AlbumResponse::from_album_with_details(&album, media_count, preview),
        media: media_items,
    }))
}

// ─── PUT /api/albums/:id ────────────────────────────────────────────────────

pub async fn update_album(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
    Json(body): Json<UpdateAlbumRequest>,
) -> Result<Json<AlbumResponse>, StatusCode> {
    load_album_owned(&state.db, &id, &claims.sub).await?;

    let mut q = sqlx::QueryBuilder::<sqlx::sqlite::Sqlite>::new("UPDATE album SET updated_at = CURRENT_TIMESTAMP");

    if let Some(ref name) = body.name {
        q.push(", name = ");
        q.push_bind(name);
    }
    if let Some(ref desc) = body.description {
        q.push(", description = ");
        q.push_bind(desc);
    }
    if let Some(ref cover) = body.cover_media_id {
        q.push(", cover_media_id = ");
        q.push_bind(cover);
    }

    q.push(" WHERE id = ");
    q.push_bind(&id);

    q.build()
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let album = sqlx::query_as::<_, Album>("SELECT * FROM album WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let count = count_album_media(&state.db, &album.id).await;
    let preview = fetch_album_preview_media(&state.db, &album.id).await;
    Ok(Json(AlbumResponse::from_album_with_details(&album, count, preview)))
}

// ─── DELETE /api/albums/:id ─────────────────────────────────────────────────

pub async fn delete_album(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    load_album_owned(&state.db, &id, &claims.sub).await?;

    // Note: CASCADE should handle album_media deletion automatically based on schema
    sqlx::query("DELETE FROM album WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── POST /api/albums/:id/media ─────────────────────────────────────────────

pub async fn add_media_to_album(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
    Json(body): Json<AlbumMediaRequest>,
) -> Result<Json<AlbumResponse>, StatusCode> {
    let album = load_album_owned(&state.db, &id, &claims.sub).await?;

    for media_id in &body.media_ids {
        let res = sqlx::query("INSERT INTO album_media (album_id, media_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
            .bind(&album.id)
            .bind(media_id)
            .execute(&state.db)
            .await;
        if let Err(e) = res {
            tracing::warn!("album_media insert error: {}", e);
        }
    }

    let count = count_album_media(&state.db, &album.id).await;
    let preview = fetch_album_preview_media(&state.db, &album.id).await;
    Ok(Json(AlbumResponse::from_album_with_details(&album, count, preview)))
}

// ─── DELETE /api/albums/:id/media ───────────────────────────────────────────

pub async fn remove_media_from_album(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
    Json(body): Json<AlbumMediaRequest>,
) -> Result<Json<AlbumResponse>, StatusCode> {
    let album = load_album_owned(&state.db, &id, &claims.sub).await?;

    for media_id in &body.media_ids {
        sqlx::query("DELETE FROM album_media WHERE album_id = ? AND media_id = ?")
            .bind(&album.id)
            .bind(media_id)
            .execute(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    let count = count_album_media(&state.db, &album.id).await;
    let preview = fetch_album_preview_media(&state.db, &album.id).await;
    Ok(Json(AlbumResponse::from_album_with_details(&album, count, preview)))
}

