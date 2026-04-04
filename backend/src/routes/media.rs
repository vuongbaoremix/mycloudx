use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, sqlite::Sqlite};

use crate::auth::jwt::Claims;
use crate::models::media::{Media, MediaResponse, GeoMediaResponse};
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

#[derive(Deserialize)]
pub struct ServeQuery {
    pub token: Option<String>,
    pub download: Option<bool>,
}

/// GET /api/media/serve/:path
pub async fn serve_file(
    State(state): State<AppState>,
    Path(file_path): Path<String>,
    Query(query): Query<ServeQuery>,
    req: axum::extract::Request,
) -> Result<axum::response::Response, StatusCode> {
    let decoded = urlencoding::decode(&file_path).unwrap_or_default().to_string();
    
    let mut download_filename = None;
    let mut encryption_key = None;

    let media_record = sqlx::query_as::<_, Media>(
        "SELECT * FROM media WHERE storage_path = ? LIMIT 1"
    )
    .bind(&decoded)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let active_media = if let Some(ref m) = media_record {
        download_filename = Some(m.original_name.clone());
        Some(m.clone())
    } else {
        let parts: Vec<&str> = decoded.splitn(2, '/').collect();
        if let Some(user_id_prefix) = parts.first() {
            sqlx::query_as::<_, Media>(
                "SELECT * FROM media WHERE user_id = ? AND \
                 (json_extract(thumbnails, '$.micro') = ? OR json_extract(thumbnails, '$.small') = ? \
                  OR json_extract(thumbnails, '$.medium') = ? OR json_extract(thumbnails, '$.large') = ? \
                  OR json_extract(thumbnails, '$.web') = ?) LIMIT 1"
            )
            .bind(user_id_prefix)
            .bind(&decoded).bind(&decoded).bind(&decoded).bind(&decoded).bind(&decoded)
            .fetch_optional(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        } else {
            None
        }
    };

    if let Some(ref media) = active_media {
        if download_filename.is_none() {
            download_filename = Some(media.original_name.clone());
        }

        if media.is_encrypted {
            let mut sealed_mk = None;
            let mut expected_user_id = media.user_id.clone();
            
            // 1. Try to authenticate the user fetching the image via `__mc` cookie
            let mut current_user_id = None;
            for cookie in req.headers().get_all(header::COOKIE).iter().filter_map(|v| v.to_str().ok()).flat_map(|s| s.split(';')) {
                let parts: Vec<&str> = cookie.splitn(2, '=').collect();
                if parts.len() == 2 {
                    let name = parts[0].trim();
                    let value = parts[1].trim();
                    if name == "__mc" {
                        if let Ok(claims) = crate::auth::jwt::verify_token(value, &state.config.jwt_secret) {
                            current_user_id = Some(claims.sub);
                        }
                    } else if name == "__mc_mk" && current_user_id.is_none() {
                        // Fallback: If no __mc parsed yet, we can't reliably use __mc_mk unless it's the owner's
                        sealed_mk = Some(value.to_string());
                    }
                }
            }

            // 2. If the user is authenticated, determine whose master key we need
            if let Some(uid) = current_user_id {
                if uid == media.user_id {
                    // It's the owner! Their own __mc_mk cookie is correct.
                    sealed_mk = req.headers().get_all(header::COOKIE).iter()
                        .filter_map(|v| v.to_str().ok()).flat_map(|s| s.split(';'))
                        .find_map(|s| {
                            let (k, v) = s.split_once('=')?;
                            if k.trim() == "__mc_mk" { Some(v.trim().to_string()) } else { None }
                        });
                } else {
                    // Not the owner. Check if it's an album collaborator
                    let collab_sealed_mk: Option<String> = sqlx::query_scalar(
                        "SELECT ac.sealed_master_key FROM album_collaborator ac 
                         JOIN album_media am ON ac.album_id = am.album_id 
                         WHERE am.media_id = ? AND ac.user_id = ? LIMIT 1"
                    )
                    .bind(&media.id)
                    .bind(&uid)
                    .fetch_optional(&state.db)
                    .await
                    .unwrap_or(None);

                    if let Some(smk) = collab_sealed_mk {
                        sealed_mk = Some(smk);
                        // The sealed_master_key in album_collaborator belongs to the owner!
                        expected_user_id = media.user_id.clone();
                    } else {
                        // Reset sealed_mk because the cookie one belongs to the collaborator, which won't decrypt the owner's file
                        sealed_mk = None;
                    }
                }
            }

            // 3. Fallback to public share link checking
            if sealed_mk.is_none() {
                if let Some(ref token) = query.token {
                    use crate::models::shared_link::SharedLink;
                    let link = sqlx::query_as::<_, SharedLink>("SELECT * FROM shared_link WHERE token = ? AND is_active = 1 LIMIT 1")
                        .bind(token)
                        .fetch_optional(&state.db)
                        .await
                        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

                    if let Some(l) = link {
                        let is_valid = match l.expires_at {
                            Some(exp) => chrono::Utc::now() <= exp,
                            None => true,
                        };
                        
                        if is_valid {
                            let mut authorized = false;
                            if l.share_type == "album" {
                                if let Some(album_id) = &l.album_id {
                                    let count: i32 = sqlx::query_scalar("SELECT 1 FROM album_media WHERE album_id = ? AND media_id = ?")
                                        .bind(album_id)
                                        .bind(&media.id)
                                        .fetch_optional(&state.db)
                                        .await
                                        .unwrap_or(None)
                                        .unwrap_or(0);
                                    authorized = count > 0;
                                }
                            } else {
                                authorized = l.media_ids.0.contains(&media.id);
                            }

                            if authorized {
                                sealed_mk = l.sealed_master_key;
                                expected_user_id = l.user_id;
                            }
                        }
                    }
                }
            }

            if let Some(sealed) = sealed_mk {
                let mk = crate::crypto::unseal_master_key(&sealed, &state.config.jwt_secret, &expected_user_id)
                    .map_err(|_| StatusCode::UNAUTHORIZED)?;
                encryption_key = Some(crate::crypto::derive_dek(&mk, &media.id));
            } else {
                return Err(StatusCode::UNAUTHORIZED);
            }
        }
    }
    
    let is_download = query.download.unwrap_or(false);

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
        
        if is_download {
            if let Some(fname) = download_filename {
                if let Ok(cd) = axum::http::header::HeaderValue::from_str(&format!("attachment; filename=\"{}\"", fname)) {
                    res.headers_mut().insert(axum::http::header::CONTENT_DISPOSITION, cd);
                }
            }
        }
        return Ok(res);
    }

    // Proxy to CloudStore if available
    if let Some(cloud_url) = state.storage.get_cloud_url(&decoded) {
        let client = reqwest::Client::new();
        let mut req_builder = client.get(&cloud_url);
        
        if let Some(api_key) = state.config.cloudstore_api_key.as_deref() {
            req_builder = req_builder.header("Authorization", format!("Bearer {}", api_key));
        }

        // Inject encryption key if media is encrypted
        if let Some(ref dek) = encryption_key {
            req_builder = req_builder.header("X-Encryption-Key", dek);
        }
        
        // Forward HTTP Range & Caching request headers to cloud-store
        let request_headers_to_forward = [
            axum::http::header::RANGE,
            axum::http::header::IF_RANGE,
            axum::http::header::IF_MATCH,
            axum::http::header::IF_NONE_MATCH,
            axum::http::header::IF_MODIFIED_SINCE,
            axum::http::header::IF_UNMODIFIED_SINCE,
        ];
        
        for h in request_headers_to_forward {
            if let Some(val) = req.headers().get(&h) {
                req_builder = req_builder.header(h, val.clone());
            }
        }
        
        let upstream_res = req_builder.send().await
            .map_err(|e| {
                tracing::error!("Proxy to cloudstore failed: {}", e);
                StatusCode::BAD_GATEWAY
            })?;
            
        let mut res_builder = axum::http::Response::builder()
            .status(upstream_res.status());
            
        // Forward essential response headers from cloud-store back to the client
        let headers_to_forward = [
            reqwest::header::CONTENT_TYPE,
            reqwest::header::CONTENT_LENGTH,
            reqwest::header::CONTENT_RANGE,
            reqwest::header::ACCEPT_RANGES,
            reqwest::header::ETAG,
            reqwest::header::LAST_MODIFIED,
            reqwest::header::CONTENT_DISPOSITION,
        ];
        
        if let Some(headers) = res_builder.headers_mut() {
            for name in &headers_to_forward {
                if let Some(value) = upstream_res.headers().get(name) {
                    headers.insert(name.clone(), value.clone());
                }
            }
            headers.insert(axum::http::header::CACHE_CONTROL, axum::http::header::HeaderValue::from_static("public, max-age=31536000"));
            
            if is_download {
                if let Some(fname) = download_filename.as_ref() {
                    if let Ok(cd) = axum::http::header::HeaderValue::from_str(&format!("attachment; filename=\"{}\"", fname)) {
                        headers.insert(axum::http::header::CONTENT_DISPOSITION, cd);
                    }
                }
            }
        }

        let body = axum::body::Body::from_stream(upstream_res.bytes_stream());
        return res_builder.body(body).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR);
    }

    // Fallback for non-local and non-cloud storage
    let data = state.storage.read(&decoded).await.map_err(|_| StatusCode::NOT_FOUND)?;
    let content_type = mime_guess::from_path(&decoded)
        .first_or_octet_stream()
        .to_string();

    let mut res = axum::response::IntoResponse::into_response(data);
    res.headers_mut().insert(header::CONTENT_TYPE, header::HeaderValue::from_str(&content_type).unwrap());
    res.headers_mut().insert(header::CACHE_CONTROL, header::HeaderValue::from_static("public, max-age=31536000"));
    if is_download {
        if let Some(fname) = download_filename {
            if let Ok(cd) = header::HeaderValue::from_str(&format!("attachment; filename=\"{}\"", fname)) {
                res.headers_mut().insert(header::CONTENT_DISPOSITION, cd);
            }
        }
    }
    Ok(res)
}


/// GET /api/media/:id/download
pub async fn download_file(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
    req: axum::extract::Request,
) -> Result<axum::response::Response, StatusCode> {
    let media = sqlx::query_as::<_, Media>(
        r#"
        SELECT m.* FROM media m
        LEFT JOIN album_media am ON m.id = am.media_id
        LEFT JOIN album_collaborator ac ON am.album_id = ac.album_id AND ac.user_id = ?
        WHERE m.id = ? AND (m.user_id = ? OR ac.can_download = 1)
        LIMIT 1
        "#
    )
        .bind(&claims.sub)
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

    // Proxy to CloudStore if available
    if let Some(cloud_url) = state.storage.get_cloud_url(&media.storage_path) {
        let client = reqwest::Client::new();
        let mut req_builder = client.get(&cloud_url);
        
        if let Some(api_key) = state.config.cloudstore_api_key.as_deref() {
            req_builder = req_builder.header("Authorization", format!("Bearer {}", api_key));
        }

        // Inject encryption key if media is encrypted
        if media.is_encrypted {
            let mut mk = None;
            if media.user_id == claims.sub {
                mk = claims.master_key(&state.config.jwt_secret);
            } else {
                let collab_sealed_mk: Option<String> = sqlx::query_scalar(
                    "SELECT ac.sealed_master_key FROM album_collaborator ac 
                     JOIN album_media am ON ac.album_id = am.album_id 
                     WHERE am.media_id = ? AND ac.user_id = ? LIMIT 1"
                )
                .bind(&media.id)
                .bind(&claims.sub)
                .fetch_optional(&state.db)
                .await
                .unwrap_or(None);

                if let Some(smk) = collab_sealed_mk {
                    mk = crate::crypto::unseal_master_key(&smk, &state.config.jwt_secret, &media.user_id).ok();
                }
            }

            if let Some(mk_bytes) = mk {
                let dek = crate::crypto::derive_dek(&mk_bytes, &media.id);
                req_builder = req_builder.header("X-Encryption-Key", dek);
            } else {
                return Err(StatusCode::UNAUTHORIZED);
            }
        }
        
        // Forward HTTP Range & Caching request headers to cloud-store
        let request_headers_to_forward = [
            axum::http::header::RANGE,
            axum::http::header::IF_RANGE,
            axum::http::header::IF_MATCH,
            axum::http::header::IF_NONE_MATCH,
            axum::http::header::IF_MODIFIED_SINCE,
            axum::http::header::IF_UNMODIFIED_SINCE,
        ];
        
        for h in request_headers_to_forward {
            if let Some(val) = req.headers().get(&h) {
                req_builder = req_builder.header(h, val.clone());
            }
        }
        
        let upstream_res = req_builder.send().await
            .map_err(|e| {
                tracing::error!("Proxy to cloudstore failed: {}", e);
                StatusCode::BAD_GATEWAY
            })?;
            
        let mut res_builder = axum::http::Response::builder()
            .status(upstream_res.status());
            
        // Forward essential response headers from cloud-store back to the client
        let headers_to_forward = [
            reqwest::header::CONTENT_TYPE,
            reqwest::header::CONTENT_LENGTH,
            reqwest::header::CONTENT_RANGE,
            reqwest::header::ACCEPT_RANGES,
            reqwest::header::ETAG,
            reqwest::header::LAST_MODIFIED,
        ];
        
        if let Some(headers) = res_builder.headers_mut() {
            for name in &headers_to_forward {
                if let Some(value) = upstream_res.headers().get(name) {
                    headers.insert(name.clone(), value.clone());
                }
            }
            
            headers.insert(
                axum::http::header::CONTENT_DISPOSITION,
                axum::http::header::HeaderValue::from_str(&format!("attachment; filename=\"{}\"", media.original_name)).unwrap()
            );
        }

        let body = axum::body::Body::from_stream(upstream_res.bytes_stream());
        return res_builder.body(body).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR);
    }

    // Fallback for non-local non-cloud storage
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
) -> Result<Json<Vec<GeoMediaResponse>>, StatusCode> {
    // Utilize the JSON location index (idx_media_geo) effectively
    let mut q_b = sqlx::QueryBuilder::<sqlx::Sqlite>::new("SELECT * FROM media WHERE user_id = ");
    q_b.push_bind(&claims.sub);
    q_b.push(" AND json_extract(metadata, '$.location.lat') IS NOT NULL AND deleted_at IS NULL AND status = 'ready' ORDER BY created_at DESC");

    let items = q_b
        .build_query_as::<Media>()
        .fetch_all(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch geo media: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let resp: Vec<GeoMediaResponse> = items.iter().map(GeoMediaResponse::from_media).collect();
    Ok(Json(resp))
}
