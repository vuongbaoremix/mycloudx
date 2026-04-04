use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::auth::jwt::Claims;
use crate::error::AppError;
use crate::models::media::{Media, MediaResponse};
use crate::models::shared_link::SharedLink;
use crate::AppState;

#[derive(Deserialize)]
pub struct CreateShareRequest {
    pub media_ids: Vec<String>,
    pub album_id: Option<String>,
    pub password: Option<String>,
    pub expires_hours: Option<i64>,
    pub max_views: Option<i32>,
}

#[derive(Serialize)]
pub struct ShareResponse {
    pub id: String,
    pub token: String,
    pub share_type: String,
    pub media_count: usize,
    pub has_password: bool,
    pub expires_at: Option<String>,
    pub view_count: i32,
    pub max_views: Option<i32>,
    pub created_at: String,
}

impl ShareResponse {
    pub fn from_link(link: &SharedLink) -> Self {
        Self {
            id: link.id.clone(),
            token: link.token.clone(),
            share_type: link.share_type.clone(),
            media_count: link.media_ids.0.len(),
            has_password: link.password_hash.is_some(),
            expires_at: link.expires_at.as_ref().map(|d| d.to_rfc3339()),
            view_count: link.view_count,
            max_views: link.max_views,
            created_at: link.created_at.to_rfc3339(),
        }
    }
}

/// POST /api/share
pub async fn create_share(
    State(state): State<AppState>,
    claims: Claims,
    Json(body): Json<CreateShareRequest>,
) -> Result<Json<ShareResponse>, AppError> {
    let token = uuid::Uuid::new_v4().to_string().replace('-', "")[..12].to_string();
    let id = uuid::Uuid::new_v4().to_string();

    let password_hash = body.password.as_ref().map(|p| {
        crate::auth::password::hash_password(p).unwrap_or_default()
    });

    let share_type = if body.album_id.is_some() { "album" } else { "media" };

    let expires_at = body.expires_hours.map(|h| Utc::now() + Duration::hours(h));
    let media_ids_json = serde_json::to_string(&body.media_ids).unwrap();

    sqlx::query(
        "INSERT INTO shared_link (id, user_id, token, share_type, media_ids, album_id, password_hash, expires_at, view_count, max_views, is_active, sealed_master_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?)"
    )
    .bind(&id)
    .bind(&claims.sub)
    .bind(&token)
    .bind(share_type)
    .bind(media_ids_json)
    .bind(&body.album_id)
    .bind(password_hash)
    .bind(expires_at)
    .bind(body.max_views)
    .bind(&claims.encrypted_mk)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create shared link: {}", e);
        AppError::Internal(anyhow::anyhow!("Failed to create shared link"))
    })?;

    let link = sqlx::query_as::<_, SharedLink>("SELECT * FROM shared_link WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| AppError::Internal(anyhow::anyhow!("Failed to fetch created link")))?;

    Ok(Json(ShareResponse::from_link(&link)))
}

/// GET /api/share
pub async fn list_shares(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<ShareResponse>>, AppError> {
    let links = sqlx::query_as::<_, SharedLink>("SELECT * FROM shared_link WHERE user_id = ? ORDER BY created_at DESC")
        .bind(&claims.sub)
        .fetch_all(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let resp: Vec<ShareResponse> = links.iter().map(ShareResponse::from_link).collect();
    Ok(Json(resp))
}

/// DELETE /api/share/:id
pub async fn delete_share(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
) -> Result<(), AppError> {
    sqlx::query("DELETE FROM shared_link WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(&claims.sub)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(())
}

/// GET /api/s/:token — Public access to shared link
#[derive(Deserialize)]
pub struct ShareAccessQuery {
    pub password: Option<String>,
}

pub async fn access_share(
    State(state): State<AppState>,
    Path(token): Path<String>,
    Query(query): Query<ShareAccessQuery>,
) -> Result<Json<SharedMediaResponse>, AppError> {
    let link = sqlx::query_as::<_, SharedLink>("SELECT * FROM shared_link WHERE token = ? AND is_active = 1 LIMIT 1")
        .bind(&token)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .ok_or_else(|| AppError::NotFound("Share not found".to_string()))?;

    // Check expiry
    if let Some(expires) = link.expires_at {
        if Utc::now() > expires {
            return Err(AppError::Forbidden("Share has expired".to_string()));
        }
    }

    // Check max views
    if let Some(max_v) = link.max_views {
        if link.view_count >= max_v {
            return Err(AppError::Forbidden("Share view limit reached".to_string()));
        }
    }

    // Check password
    if let Some(ref hash) = link.password_hash {
        let pw = query.password.as_deref().ok_or_else(|| AppError::Unauthorized("Password required".to_string()))?;
        let valid = crate::auth::password::verify_password(pw, hash)
            .map_err(|e| AppError::Internal(e.into()))?;
        if !valid {
            return Err(AppError::Unauthorized("Invalid password".to_string()));
        }
    }

    // Increment view count
    let _ = sqlx::query("UPDATE shared_link SET view_count = view_count + 1 WHERE id = ?")
        .bind(&link.id)
        .execute(&state.db)
        .await;

    // Fetch shared media
    let mut media_ids_to_fetch = link.media_ids.0.clone();

    if link.share_type == "album" {
        if let Some(album_id) = link.album_id {
            let album_media_ids: Vec<String> = sqlx::query_scalar("SELECT media_id FROM album_media WHERE album_id = ?")
                .bind(album_id)
                .fetch_all(&state.db)
                .await
                .unwrap_or_default();
            media_ids_to_fetch = album_media_ids;
        }
    }

    let media_items = if !media_ids_to_fetch.is_empty() {
        let mut q = sqlx::QueryBuilder::<sqlx::sqlite::Sqlite>::new("SELECT * FROM media WHERE id IN (");
        let mut separated = q.separated(", ");
        for mid in &media_ids_to_fetch {
            separated.push_bind(mid);
        }
        separated.push_unseparated(") AND deleted_at IS NULL ORDER BY created_at DESC");

        let items: Vec<Media> = q.build_query_as()
            .fetch_all(&state.db)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
        
        items.iter().map(MediaResponse::from_media).collect()
    } else {
        vec![]
    };

    Ok(Json(SharedMediaResponse {
        media: media_items,
        share_type: link.share_type,
    }))
}

#[derive(Serialize)]
pub struct SharedMediaResponse {
    pub media: Vec<MediaResponse>,
    pub share_type: String,
}
