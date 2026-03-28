use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use cloudstore_common::{CloudStoreError, PathId};
use cloudstore_sync::queue::SyncJob;
use serde_json::json;
use tracing::{info, error};

use crate::error::ApiError;
use crate::state::AppState;

/// PUT /api/files/{provider}/{*path} — Upload a file.
/// Streams body directly to disk — constant RAM usage regardless of file size.
pub async fn upload_file(
    State(state): State<AppState>,
    Path((provider, path)): Path<(String, String)>,
    body: Body,
) -> Result<impl IntoResponse, ApiError> {
    let path_id = PathId::new(&provider, &path)?;

    // Convert Body into a stream of Bytes chunks.
    let stream = body.into_data_stream();

    // Stream directly to disk — only 1 chunk in RAM at a time.
    let meta = state.cache.store_stream(&path_id, stream).await?;

    // Enqueue background sync job asynchronously so it doesn't block the API response.
    let job = SyncJob::new(path_id.clone());
    let sync_queue = state.sync_queue.clone();
    let p_id = path_id.clone();
    tokio::spawn(async move {
        if let Err(e) = sync_queue.enqueue(job).await {
            error!(path_id = %p_id, error = %e, "Failed to enqueue sync job");
        }
    });

    info!(path_id = %path_id, size = meta.size_bytes, "File uploaded (streamed)");
    state.metrics.inc_uploads();
    state.metrics.add_bytes_uploaded(meta.size_bytes);

    Ok((
        StatusCode::OK,
        Json(json!({
            "path_id": path_id.as_str(),
            "original_name": meta.original_name,
            "content_hash": meta.content_hash,
            "size_bytes": meta.size_bytes,
            "mime_type": meta.mime_type,
            "status": meta.status,
            "created_at": meta.created_at.to_rfc3339(),
        })),
    ))
}

/// GET /api/files/{provider}/{*path} — Download a file.
pub async fn download_file(
    State(state): State<AppState>,
    Path((provider, path)): Path<(String, String)>,
) -> Result<Response, ApiError> {
    let path_id = PathId::new(&provider, &path)?;

    // Check if file exists in index.
    let meta = state
        .cache
        .get_meta(&path_id)
        .await
        .ok_or_else(|| CloudStoreError::NotFound(path_id.to_string()))?;

    // Try reading from local cache first — stream directly from disk (constant RAM).
    if state.cache.file_exists_on_disk(&path_id).await {
        let file_path = state.cache.get_file_path(&path_id);
        let file = tokio::fs::File::open(&file_path).await.map_err(|e| {
            ApiError::from(CloudStoreError::Io(e))
        })?;

        let stream = tokio_util::io::ReaderStream::new(file);
        let body = Body::from_stream(stream);

        let mut headers = HeaderMap::new();
        headers.insert(
            header::CONTENT_TYPE,
            meta.mime_type.parse().unwrap_or(header::HeaderValue::from_static("application/octet-stream")),
        );
        headers.insert(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", meta.original_name)
                .parse()
                .unwrap(),
        );
        headers.insert(
            header::CONTENT_LENGTH,
            meta.size_bytes.to_string().parse().unwrap(),
        );

        state.metrics.inc_downloads_cache();
        state.metrics.add_bytes_downloaded(meta.size_bytes);
        return Ok((StatusCode::OK, headers, body).into_response());
    }

    // File not on disk (evicted) — fetch from cloud and re-cache.
    if let Some(cloud_url) = &meta.cloud_url {
        let provider = state.provider.as_ref().ok_or_else(|| {
            ApiError::from(CloudStoreError::SyncError(
                "Cloud provider not available. Set up GDrive OAuth2 first.".into(),
            ))
        })?;

        info!(path_id = %path_id, "File evicted, downloading from cloud");

        let cloud_data = provider.download(cloud_url).await
            .map_err(|e| ApiError::from(CloudStoreError::SyncError(format!(
                "Failed to download from cloud: {}", e
            ))))?;

        // Re-cache the downloaded data.
        let _ = state.cache.store(&path_id, &cloud_data).await?;

        let mut headers = HeaderMap::new();
        headers.insert(
            header::CONTENT_TYPE,
            meta.mime_type.parse().unwrap_or(header::HeaderValue::from_static("application/octet-stream")),
        );
        headers.insert(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", meta.original_name)
                .parse()
                .unwrap(),
        );
        headers.insert(
            header::CONTENT_LENGTH,
            cloud_data.len().to_string().parse().unwrap(),
        );

        // Restore synced status (since it was already on cloud).
        if let Some(mut updated_meta) = state.cache.get_meta(&path_id).await {
            updated_meta.status = cloudstore_common::FileStatus::Synced;
            updated_meta.cloud_url = Some(cloud_url.clone());
            updated_meta.synced_at = meta.synced_at;
            let _ = state.cache.update_meta(&path_id, updated_meta).await;
        }

        state.metrics.inc_downloads_cloud();
        state.metrics.add_bytes_downloaded(cloud_data.len() as u64);
        return Ok((StatusCode::OK, headers, cloud_data).into_response());
    }

    Err(ApiError::from(CloudStoreError::NotFound(format!(
        "File {} not found on disk and has no cloud URL",
        path_id
    ))))
}

/// HEAD /api/files/{provider}/{*path} — Get file metadata via headers.
pub async fn head_file(
    State(state): State<AppState>,
    Path((provider, path)): Path<(String, String)>,
) -> Result<Response, ApiError> {
    let path_id = PathId::new(&provider, &path)?;

    let meta = state
        .cache
        .get_meta(&path_id)
        .await
        .ok_or_else(|| CloudStoreError::NotFound(path_id.to_string()))?;

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        meta.mime_type.parse().unwrap_or(header::HeaderValue::from_static("application/octet-stream")),
    );
    headers.insert(
        header::CONTENT_LENGTH,
        meta.size_bytes.to_string().parse().unwrap(),
    );
    headers.insert(
        "X-CloudStore-Status",
        meta.status.to_string().parse().unwrap(),
    );
    headers.insert(
        "X-CloudStore-Hash",
        meta.content_hash.parse().unwrap(),
    );
    if let Some(ref url) = meta.cloud_url {
        headers.insert("X-CloudStore-Cloud-URL", url.parse().unwrap());
    }

    Ok((StatusCode::OK, headers).into_response())
}

/// DELETE /api/files/{provider}/{*path} — Delete a file.
pub async fn delete_file(
    State(state): State<AppState>,
    Path((provider, path)): Path<(String, String)>,
) -> Result<impl IntoResponse, ApiError> {
    let path_id = PathId::new(&provider, &path)?;

    // Get meta before deletion to check for cloud_url.
    let meta = state.cache.get_meta(&path_id).await;

    let removed = state.cache.delete(&path_id).await?;

    match removed {
        Some(_) => {
            // Delete from cloud if synced.
            if let Some(ref m) = meta {
                if let Some(ref cloud_url) = m.cloud_url {
                    if let Some(ref provider) = state.provider {
                        match provider.delete(cloud_url).await {
                            Ok(_) => info!(path_id = %path_id, "File deleted from cloud"),
                            Err(e) => error!(path_id = %path_id, error = %e, "Failed to delete from cloud (cache already removed)"),
                        }
                    } else {
                        tracing::warn!(path_id = %path_id, "Cloud provider not available, skipping cloud delete");
                    }
                }
            }

            info!(path_id = %path_id, "File deleted");
            state.metrics.inc_deletes();
            Ok((
                StatusCode::OK,
                Json(json!({ "deleted": path_id.as_str() })),
            ))
        }
        None => Err(ApiError::from(CloudStoreError::NotFound(
            path_id.to_string(),
        ))),
    }
}

/// GET /api/list/{provider}/{*path} — List files under a prefix.
pub async fn list_files(
    State(state): State<AppState>,
    Path((provider, path)): Path<(String, String)>,
) -> impl IntoResponse {
    let prefix = if path.is_empty() { None } else { Some(path.as_str()) };
    let entries = state.cache.list(&provider, prefix).await;

    let files: Vec<_> = entries
        .into_iter()
        .map(|(path_id, meta)| {
            json!({
                "path_id": path_id,
                "original_name": meta.original_name,
                "size_bytes": meta.size_bytes,
                "mime_type": meta.mime_type,
                "status": meta.status,
                "created_at": meta.created_at.to_rfc3339(),
            })
        })
        .collect();

    Json(json!({
        "provider": provider,
        "count": files.len(),
        "files": files,
    }))
}

/// GET /api/status/{provider}/{*path} — Get sync status.
pub async fn file_status(
    State(state): State<AppState>,
    Path((provider, path)): Path<(String, String)>,
) -> Result<impl IntoResponse, ApiError> {
    let path_id = PathId::new(&provider, &path)?;

    let meta = state
        .cache
        .get_meta(&path_id)
        .await
        .ok_or_else(|| CloudStoreError::NotFound(path_id.to_string()))?;

    Ok(Json(json!({
        "path_id": path_id.as_str(),
        "status": meta.status,
        "cloud_url": meta.cloud_url,
        "synced_at": meta.synced_at.map(|t| t.to_rfc3339()),
        "retry_count": meta.retry_count,
        "on_disk": state.cache.file_exists_on_disk(&path_id).await,
    })))
}
