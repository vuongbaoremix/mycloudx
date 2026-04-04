use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use cloudstore_common::{CloudStoreError, PathId};
use cloudstore_sync::queue::SyncJob;
use serde_json::json;
use tracing::{info, error};
use sha2::{Digest, Sha256};
use chacha20::ChaCha20;
use chacha20::cipher::{KeyIvInit, StreamCipher};
use rand::Rng;
use futures_util::StreamExt;

use crate::error::ApiError;
use crate::state::AppState;

/// PUT /api/files/{provider}/{*path} — Upload a file.
/// Streams body directly to disk — constant RAM usage regardless of file size.
pub async fn upload_file(
    State(state): State<AppState>,
    Path((provider, path)): Path<(String, String)>,
    headers: HeaderMap,
    body: Body,
) -> Result<impl IntoResponse, ApiError> {
    let path_id = PathId::new(&provider, &path)?;

    // Handle Optional SSE-C Encryption
    let encryption_key = headers.get("x-encryption-key").and_then(|v| v.to_str().ok());
    
    let mut is_encrypted = false;
    let mut encryption_iv = None;
    let mut key_verification_hash = None;
    
    // Check if the body needs to be decoded by ChaCha20
    let stream = if let Some(key_raw) = encryption_key {
        let mut hasher = Sha256::new();
        hasher.update(key_raw.as_bytes());
        let key_bytes: [u8; 32] = hasher.finalize().into();
        
        let mut iv_bytes = [0u8; 12];
        rand::thread_rng().fill(&mut iv_bytes);
        
        let mut hash_verify = Sha256::new();
        hash_verify.update(&key_bytes);
        
        is_encrypted = true;
        encryption_iv = Some(hex::encode(iv_bytes));
        key_verification_hash = Some(hex::encode(hash_verify.finalize()));
        
        let mut cipher = ChaCha20::new(&key_bytes.into(), &iv_bytes.into());
        
        // Wrap the incoming body stream in a decryption map
        axum::body::Body::from_stream(body.into_data_stream().map(move |chunk_res| {
            chunk_res.map(|mut chunk| {
                let mut data = chunk.to_vec();
                cipher.apply_keystream(&mut data);
                bytes::Bytes::from(data)
            })
        })).into_data_stream()
    } else {
        body.into_data_stream()
    };

    // Stream directly to disk — only 1 chunk in RAM at a time.
    let mut meta = state.cache.store_stream(&path_id, stream).await?;
    
    // Save encryption metadata
    if is_encrypted {
        meta.is_encrypted = true;
        meta.encryption_iv = encryption_iv;
        meta.key_verification_hash = key_verification_hash;
        // update `.meta.json` atomically
        state.cache.update_meta(&path_id, meta.clone()).await.map_err(|e| ApiError::from(e))?;
    }

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
    req: axum::extract::Request,
) -> Result<Response, ApiError> {
    let path_id = PathId::new(&provider, &path)?;
    let encryption_key = req.headers().get("x-encryption-key").and_then(|v| v.to_str().ok().map(|s| s.to_string()));


    // Check if file exists in index.
    let meta = state
        .cache
        .get_meta(&path_id)
        .await
        .ok_or_else(|| CloudStoreError::NotFound(path_id.to_string()))?;

    // Try reading from local cache first — stream directly from disk (constant RAM).
    if state.cache.file_exists_on_disk(&path_id).await {
        let file_path = state.cache.get_file_path(&path_id);
        
        use tower::ServiceExt;
        let mut res = tower_http::services::ServeFile::new(file_path)
            .oneshot(req)
            .await
            .map_err(|e| ApiError::from(CloudStoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, e))))?
            .into_response();

        res.headers_mut().insert(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", meta.original_name)
                .parse()
                .unwrap(),
        );
        
        if !res.headers().contains_key(header::CONTENT_TYPE) {
            res.headers_mut().insert(
                header::CONTENT_TYPE,
                meta.mime_type.parse().unwrap_or(header::HeaderValue::from_static("application/octet-stream")),
            );
        }

        state.metrics.inc_downloads_cache();
        state.metrics.add_bytes_downloaded(meta.size_bytes);
        return apply_decryption_if_needed(res, &meta, encryption_key.as_deref());
    }

    // File not on disk (evicted) — fetch from cloud and re-cache.
    if let Some(cloud_url) = &meta.cloud_url {
        let provider = state.provider.as_ref().ok_or_else(|| {
            ApiError::from(CloudStoreError::SyncError(
                "Cloud provider not available. Set up GDrive OAuth2 first.".into(),
            ))
        })?;

        info!(path_id = %path_id, "File evicted, downloading from cloud");

        let has_range = req.headers().contains_key(header::RANGE);

        let response = provider.proxy_stream(cloud_url, req.headers()).await
            .map_err(|e| ApiError::from(CloudStoreError::SyncError(format!(
                "Failed to proxy cloud stream: {}", e
            ))))?;

        let (mut parts, incoming_body) = response.into_parts();

        parts.headers.insert(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", meta.original_name)
                .parse()
                .unwrap(),
        );
        
        if !parts.headers.contains_key(header::CONTENT_TYPE) {
            parts.headers.insert(
                header::CONTENT_TYPE,
                meta.mime_type.parse().unwrap_or(header::HeaderValue::from_static("application/octet-stream")),
            );
        }

        let path_id_str = path_id.to_string();
        let mut active_downloads = state.active_downloads.lock().await;

        if has_range {
            let body = axum::body::Body::new(incoming_body);
            
            // Background full file cache
            if !active_downloads.contains(&path_id_str) {
                active_downloads.insert(path_id_str.clone());
                let active_downloads_clone = state.active_downloads.clone();
                let cache_clone = state.cache.clone();
                let provider_clone = provider.clone();
                let cloud_url_clone = cloud_url.clone();
                let path_id_clone = path_id.clone();
                
                tokio::spawn(async move {
                    info!(path_id = %path_id_clone, "Background caching started (Range request triggered)");
                    if let Ok(bg_res) = provider_clone.proxy_stream(&cloud_url_clone, &hyper::HeaderMap::new()).await {
                        use http_body_util::BodyExt;
                        let stream = bg_res.into_body().into_data_stream();
                        let _ = cache_clone.store_stream(&path_id_clone, stream).await;
                    }
                    active_downloads_clone.lock().await.remove(&path_id_str);
                });
            }
            
            state.metrics.inc_downloads_cloud();
            return apply_decryption_if_needed((parts, body).into_response(), &meta, encryption_key.as_deref());
        } else {
            if active_downloads.contains(&path_id_str) {
                let body = axum::body::Body::new(incoming_body);
                state.metrics.inc_downloads_cloud();
                return apply_decryption_if_needed((parts, body).into_response(), &meta, encryption_key.as_deref());
            }

            active_downloads.insert(path_id_str.clone());
            let active_downloads_clone = state.active_downloads.clone();
            let cache_clone = state.cache.clone();
            let path_id_clone = path_id.clone();
            
            // Tie into Axum Body
            let (tx, rx) = tokio::sync::mpsc::channel::<Result<bytes::Bytes, axum::Error>>(64);
            let stream = tokio_stream::wrappers::ReceiverStream::new(rx);
            let body = axum::body::Body::from_stream(stream);
            
            // Tie into Cache store_stream
            let (tx_cache, rx_cache) = tokio::sync::mpsc::channel::<Result<bytes::Bytes, std::io::Error>>(64);
            
            tokio::spawn(async move {
                use http_body_util::BodyExt;
                use futures_util::stream::StreamExt;
                let mut incoming_stream = incoming_body.into_data_stream();
                let rx_stream = tokio_stream::wrappers::ReceiverStream::new(rx_cache);

                let read_pump = async {
                    let mut tx_client_alive = true;
                    while let Some(chunk_res) = incoming_stream.next().await {
                        match chunk_res {
                            Ok(chunk) => {
                                let chunk_bytes: bytes::Bytes = chunk;
                                if tx_client_alive {
                                    if tx.send(Ok(chunk_bytes.clone())).await.is_err() {
                                        tx_client_alive = false;
                                    }
                                }
                                if tx_cache.send(Ok(chunk_bytes)).await.is_err() {
                                    break;
                                }
                            }
                            Err(e) => {
                                let io_err = std::io::Error::new(std::io::ErrorKind::Other, e.to_string());
                                let _ = tx.send(Err(axum::Error::new(io_err))).await;
                                let _ = tx_cache.send(Err(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))).await;
                                break;
                            }
                        }
                    }
                    drop(tx);
                    drop(tx_cache);
                };

                let store_future = cache_clone.store_stream(&path_id_clone, rx_stream);
                
                let (_, _) = tokio::join!(read_pump, store_future);
                
                active_downloads_clone.lock().await.remove(&path_id_str);
            });
            
            state.metrics.inc_downloads_cloud();
            return apply_decryption_if_needed((parts, body).into_response(), &meta, encryption_key.as_deref());
        }
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

/// Helper function to decrypt HTTP Response Stream on-the-fly using ChaCha20
fn apply_decryption_if_needed(
    res: Response,
    meta: &cloudstore_common::FileMeta,
    encryption_key: Option<&str>,
) -> Result<Response, ApiError> {
    if !meta.is_encrypted {
        return Ok(res);
    }

    let key_raw = encryption_key.ok_or_else(|| {
        ApiError::from(CloudStoreError::Unauthorized("Missing X-Encryption-Key header for encrypted file".into()))
    })?;

    let mut hasher = Sha256::new();
    hasher.update(key_raw.as_bytes());
    let key_bytes: [u8; 32] = hasher.finalize().into();

    let mut hash_verify = Sha256::new();
    hash_verify.update(&key_bytes);
    let derived_hash = hex::encode(hash_verify.finalize());

    if Some(derived_hash) != meta.key_verification_hash {
        return Err(ApiError::from(CloudStoreError::Unauthorized("Invalid X-Encryption-Key".into())));
    }

    let iv_hex = meta.encryption_iv.as_ref().unwrap();
    let iv_bytes = hex::decode(iv_hex).map_err(|e| {
        ApiError::from(CloudStoreError::Validation(format!("Invalid IV mapping: {}", e)))
    })?;
    
    // Safety check for ChaCha20 Nonce length
    if iv_bytes.len() != 12 {
        return Err(ApiError::from(CloudStoreError::Validation("Invalid IV length".into())));
    }

    let iv_array: [u8; 12] = iv_bytes.try_into().unwrap();
    let mut cipher = ChaCha20::new(&key_bytes.into(), &iv_array.into());

    let mut offset = 0;
    if res.status() == StatusCode::PARTIAL_CONTENT {
        if let Some(cr) = res.headers().get(header::CONTENT_RANGE) {
            if let Ok(cr_str) = cr.to_str() {
                if let Some(start_str) = cr_str.strip_prefix("bytes ").and_then(|s| s.split('-').next()) {
                    offset = start_str.parse::<u64>().unwrap_or(0);
                }
            }
        }
    }

    // O(1) Seek to byte offset stream
    use chacha20::cipher::StreamCipherSeek;
    cipher.seek(offset);

    let (parts, body) = res.into_parts();

    let decrypted_stream = body.into_data_stream().map(move |chunk_res| {
        chunk_res.map(|chunk| {
            let mut data = chunk.to_vec();
            cipher.apply_keystream(&mut data);
            bytes::Bytes::from(data)
        })
    });

    let decrypted_body = axum::body::Body::from_stream(decrypted_stream);
    Ok(Response::from_parts(parts, decrypted_body))
}
