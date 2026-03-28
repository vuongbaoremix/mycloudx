use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sha2::Digest;

use crate::auth::jwt::Claims;
use crate::imaging::exif;
use crate::models::media::{Media, MediaResponse};
use crate::AppState;

#[derive(Deserialize)]
pub struct CreateSessionRequest {
    pub files: Vec<SessionFileInfo>,
}

#[derive(Deserialize)]
pub struct SessionFileInfo {
    pub name: String,
    pub size: f64,
}

#[derive(Serialize)]
pub struct SessionResponse {
    pub session_id: String,
    pub status: String,
}

/// POST /api/upload/session
pub async fn create_session(
    State(state): State<AppState>,
    claims: Claims,
    Json(body): Json<CreateSessionRequest>,
) -> Result<Json<SessionResponse>, StatusCode> {
    let files_json: Vec<serde_json::Value> = body
        .files
        .iter()
        .map(|f| {
            serde_json::json!({
                "original_name": f.name,
                "size": f.size,
                "status": "pending",
                "error": null,
                "media_id": null
            })
        })
        .collect();

    let session_id = uuid::Uuid::new_v4().to_string();
    let total = body.files.len() as i32;
    let files_str = serde_json::to_string(&files_json).unwrap_or_else(|_| "[]".to_string());

    sqlx::query(
        "INSERT INTO upload_session (id, user_id, total_files, completed_files, failed_files, status, files)
         VALUES (?, ?, ?, 0, 0, 'active', ?)",
    )
    .bind(&session_id)
    .bind(&claims.sub)
    .bind(total)
    .bind(&files_str)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("create_session DB error: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(SessionResponse {
        session_id,
        status: "active".into(),
    }))
}

/// POST /api/upload/file
///
/// New flow (memory-optimised):
///   1. Parse multipart → compute hash → duplicate check
///   2. Write raw bytes to local temp file → drop from heap
///   3. DB insert (status = processing)
///   4. Enqueue job (carries only path strings, no raw data)
///   5. Return response immediately — worker handles storage upload + thumbnails
pub async fn upload_file(
    State(state): State<AppState>,
    claims: Claims,
    mut multipart: Multipart,
) -> Result<Json<MediaResponse>, StatusCode> {
    let mut file_data: Option<Vec<u8>> = None;
    let mut thumb_data: Option<Vec<u8>> = None;
    let mut original_name = String::new();
    let mut mime_type = String::from("application/octet-stream");
    let mut session_id: Option<String> = None;

    let total_start = std::time::Instant::now();
    let mut t = std::time::Instant::now();

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                if let Some(fname) = field.file_name() {
                    original_name = fname.to_string();
                }
                if let Some(ct) = field.content_type() {
                    mime_type = ct.to_string();
                }
                let bytes = field.bytes().await.map_err(|_| StatusCode::BAD_REQUEST)?;
                file_data = Some(bytes.to_vec());
            }
            "sessionId" => {
                let text = field.text().await.map_err(|_| StatusCode::BAD_REQUEST)?;
                session_id = Some(text);
            }
            "thumbnail" => {
                let bytes = field.bytes().await.map_err(|_| StatusCode::BAD_REQUEST)?;
                thumb_data = Some(bytes.to_vec());
            }
            _ => {}
        }
    }

    tracing::info!("Upload perf: parsed multipart in {:?}", t.elapsed());
    t = std::time::Instant::now();

    let data = file_data.ok_or(StatusCode::BAD_REQUEST)?;
    if original_name.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Compute SHA-256 hash for duplicate detection
    let mut hasher = sha2::Sha256::new();
    hasher.update(&data);
    let file_hash = hex::encode(hasher.finalize());

    tracing::info!("Upload perf: computed hash in {:?}", t.elapsed());
    t = std::time::Instant::now();

    // Duplicate check
    let user_id = claims.sub.clone();
    let existing = sqlx::query_as::<_, Media>(
        "SELECT * FROM media WHERE user_id = ? AND file_hash = ? AND deleted_at IS NULL LIMIT 1",
    )
    .bind(&user_id)
    .bind(&file_hash)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("duplicate check DB error: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if let Some(dup) = existing {
        tracing::info!("Upload perf: duplicate found in {:?}", t.elapsed());
        return Ok(Json(MediaResponse::from_media(&dup)));
    }

    tracing::info!("Upload perf: checked duplicate in {:?}", t.elapsed());
    t = std::time::Instant::now();

    let file_uuid = uuid::Uuid::new_v4().to_string();
    let temp_path = state
        .config
        .upload_dir
        .join("tmp")
        .join(format!("{}.bin", file_uuid));
    let file_size = data.len() as f64;

    tokio::fs::write(&temp_path, &data).await.map_err(|e| {
        tracing::error!("Failed to write temp file: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    drop(data); // release raw image bytes from heap right now

    finalize_upload(
        &state,
        &claims,
        file_uuid,
        original_name,
        mime_type,
        file_hash,
        file_size,
        temp_path,
        thumb_data,
        session_id,
        total_start,
        t,
    )
    .await
}

async fn finalize_upload(
    state: &AppState,
    claims: &Claims,
    file_uuid: String,
    original_name: String,
    mime_type: String,
    file_hash: String,
    file_size: f64,
    temp_path: std::path::PathBuf,
    thumb_data: Option<Vec<u8>>,
    session_id: Option<String>,
    total_start: std::time::Instant,
    mut t: std::time::Instant,
) -> Result<Json<MediaResponse>, StatusCode> {
    let user_id = claims.sub.clone();

    // Check again for duplicates in finalize phase if shared logic needs it, wait, we already checked.
    // Actually, let's just do all of it from storage_dir forward
    let ext = std::path::Path::new(&original_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    let filename = format!("{}.{}", file_uuid, ext);
    let now = chrono::Utc::now();
    let safe_uid = user_id.replace(':', "_");
    let hash_prefix = if file_hash.len() >= 2 { &file_hash[..2] } else { "xx" };
    
    let storage_dir = format!(
        "{}/{}/{:02}/{:02}/{}/{}",
        safe_uid,
        now.format("%Y"),
        now.format("%m"),
        now.format("%d"),
        hash_prefix,
        file_uuid
    );
    let storage_path = format!("{}/{}", storage_dir, filename);

    let mut video_thumb_path = None;
    if let Some(t_data) = thumb_data {
        let t_path = state.config.upload_dir.join("tmp").join(format!("{}_thumb.bin", file_uuid));
        if tokio::fs::write(&t_path, &t_data).await.is_ok() {
            video_thumb_path = Some(t_path);
        }
    }

    tracing::info!("Upload perf: wrote temp file (or thumb) in {:?}", t.elapsed());
    t = std::time::Instant::now();

    // Extract EXIF metadata from the temp file (local I/O, very fast)
    let mut width: Option<i32> = None;
    let mut height: Option<i32> = None;
    let mut aspect_ratio = 1.0_f64;
    let mut metadata_json: serde_json::Value = serde_json::Value::Null;

    if mime_type.starts_with("image/") {
        if let Ok(exif_bytes) = tokio::fs::read(&temp_path).await {
            if let Ok(meta) = exif::extract_metadata(&exif_bytes) {
                width = Some(meta.width as i32);
                height = Some(meta.height as i32);
                if meta.height > 0 {
                    aspect_ratio = meta.width as f64 / meta.height as f64;
                }
                metadata_json = serde_json::json!({
                    "exif": meta.exif,
                    "location": meta.location.map(|l| serde_json::json!({"lat": l.lat, "lng": l.lng})),
                    "taken_at": meta.taken_at.map(|d| d.to_rfc3339()),
                    "camera_make": meta.camera_make,
                    "camera_model": meta.camera_model,
                    "orientation": meta.orientation,
                });
            }
        }
    }

    tracing::info!("Upload perf: extracted metadata in {:?}", t.elapsed());
    t = std::time::Instant::now();

    // Insert DB record with status = processing
    let record_id = uuid::Uuid::new_v4().to_string();
    let status = if mime_type.starts_with("image/") || mime_type.starts_with("video/") {
        "processing"
    } else {
        "ready"
    };
    let meta_str = if metadata_json.is_null() {
        None
    } else {
        Some(serde_json::to_string(&metadata_json).unwrap_or_default())
    };
    let thumbs_str = serde_json::to_string(&serde_json::json!({
        "micro": null, "small": null, "medium": null, "large": null
    }))
    .unwrap_or_default();

    sqlx::query(
        "INSERT INTO media (id, user_id, filename, original_name, mime_type, size, file_hash, \
         width, height, aspect_ratio, thumbnails, storage_path, storage_provider, blur_hash, \
         metadata, status, is_favorite)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', NULL, ?, ?, 0)",
    )
    .bind(&record_id)
    .bind(&user_id)
    .bind(&filename)
    .bind(&original_name)
    .bind(&mime_type)
    .bind(file_size)
    .bind(&file_hash)
    .bind(width)
    .bind(height)
    .bind(aspect_ratio)
    .bind(&thumbs_str)
    .bind(&storage_path)
    .bind(meta_str)
    .bind(status)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB insert error: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let final_media = sqlx::query_as::<_, Media>("SELECT * FROM media WHERE id = ?")
        .bind(&record_id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("fetch final_media DB error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    tracing::info!("Upload perf: inserted into DB in {:?}", t.elapsed());
    t = std::time::Instant::now();

    // Enqueue background job — only path strings travel through memory from here
    state.job_queue.enqueue(crate::imaging::job_queue::ProcessJob {
        record_id: record_id.clone(),
        temp_path,
        storage_path,
        mime_type: mime_type.clone(),
        video_thumb_path,
    });

    // Update storage usage
    let _ = sqlx::query(
        "UPDATE user SET storage_used = storage_used + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(file_size)
    .bind(&user_id)
    .execute(&state.db)
    .await;

    // Update session progress
    if let Some(sid) = session_id {
        let _ = sqlx::query(
            "UPDATE upload_session SET completed_files = completed_files + 1, \
             updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
        )
        .bind(&sid)
        .bind(&user_id)
        .execute(&state.db)
        .await;
    }

    tracing::info!("Upload perf: enqueued + updated session in {:?}", t.elapsed());
    tracing::info!("Upload perf: TOTAL handler time {:?}", total_start.elapsed());

    Ok(Json(MediaResponse::from_media(&final_media)))
}

/// POST /api/upload/chunk
/// Receive a single file chunk and append it to temp storage
pub async fn upload_chunk(
    State(state): State<AppState>,
    _claims: Claims,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let mut file_id = String::new();
    let mut chunk_index = 0_usize;
    let mut chunk_data: Option<Vec<u8>> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file_id" => {
                file_id = field.text().await.unwrap_or_default();
            }
            "chunk_index" => {
                let text = field.text().await.unwrap_or_default();
                chunk_index = text.parse().unwrap_or(0);
            }
            "chunk" => {
                let bytes = field.bytes().await.map_err(|_| StatusCode::BAD_REQUEST)?;
                chunk_data = Some(bytes.to_vec());
            }
            _ => {}
        }
    }

    if file_id.is_empty() || chunk_data.is_none() {
        return Err(StatusCode::BAD_REQUEST);
    }
    
    // Validate UUID format
    if uuid::Uuid::parse_str(&file_id).is_err() {
        return Err(StatusCode::BAD_REQUEST);
    }
    
    let data = chunk_data.unwrap();
    let temp_path = state
        .config
        .upload_dir
        .join("tmp")
        .join(format!("{}.part{}", file_id, chunk_index));
        
    tokio::fs::write(&temp_path, &data).await.map_err(|e| {
        tracing::error!("Failed to write chunk file: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(serde_json::json!({ "status": "ok" })))
}

/// POST /api/upload/complete
pub async fn complete_upload(
    State(state): State<AppState>,
    claims: Claims,
    mut multipart: Multipart,
) -> Result<Json<MediaResponse>, StatusCode> {
    let mut file_id = String::new();
    let mut original_name = String::new();
    let mut mime_type = String::from("application/octet-stream");
    let mut session_id: Option<String> = None;
    let mut total_chunks = 0_usize;
    let mut thumb_data: Option<Vec<u8>> = None;

    let total_start = std::time::Instant::now();
    let mut t = std::time::Instant::now();

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file_id" => file_id = field.text().await.unwrap_or_default(),
            "original_name" => original_name = field.text().await.unwrap_or_default(),
            "mime_type" => mime_type = field.text().await.unwrap_or("application/octet-stream".to_string()),
            "session_id" => {
                let text = field.text().await.unwrap_or_default();
                if !text.is_empty() {
                    session_id = Some(text);
                }
            }
            "total_chunks" => {
                let text = field.text().await.unwrap_or_default();
                total_chunks = text.parse().unwrap_or(0);
            }
            "thumbnail" => {
                let bytes = field.bytes().await.map_err(|_| StatusCode::BAD_REQUEST)?;
                thumb_data = Some(bytes.to_vec());
            }
            _ => {}
        }
    }

    if file_id.is_empty() || original_name.is_empty() || total_chunks == 0 {
        return Err(StatusCode::BAD_REQUEST);
    }
    
    if uuid::Uuid::parse_str(&file_id).is_err() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let final_temp_path = state.config.upload_dir.join("tmp").join(format!("{}.bin", file_id));

    // Merge chunks
    {
        use tokio::io::AsyncWriteExt;
        let mut final_file = tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&final_temp_path)
            .await
            .map_err(|e| {
                tracing::error!("Failed to create merged file: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        for i in 0..total_chunks {
            let chunk_path = state.config.upload_dir.join("tmp").join(format!("{}.part{}", file_id, i));
            let mut chunk_file = tokio::fs::File::open(&chunk_path).await.map_err(|e| {
                tracing::error!("Failed to open chunk file part {}: {}", i, e);
                StatusCode::BAD_REQUEST
            })?;
            tokio::io::copy(&mut chunk_file, &mut final_file).await.map_err(|e| {
                tracing::error!("Failed to copy chunk file part {}: {}", i, e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
            
            // Clean up chunk
            let _ = tokio::fs::remove_file(chunk_path).await;
        }
    }

    tracing::info!("Upload perf: merged chunks in {:?}", t.elapsed());
    t = std::time::Instant::now();

    // Compute SHA-256 and size via stream
    let mut hasher = sha2::Sha256::new();
    let mut file_size = 0_f64;
    {
        use tokio::io::AsyncReadExt;
        let mut file = tokio::fs::File::open(&final_temp_path).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let mut buffer = vec![0; 65536];
        loop {
            let count = file.read(&mut buffer).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            if count == 0 { break; }
            hasher.update(&buffer[..count]);
            file_size += count as f64;
        }
    }
    let file_hash = hex::encode(hasher.finalize());
    tracing::info!("Upload perf: hashed chunked file in {:?}", t.elapsed());
    t = std::time::Instant::now();

    // Duplicate check
    let user_id = claims.sub.clone();
    let existing = sqlx::query_as::<_, Media>(
        "SELECT * FROM media WHERE user_id = ? AND file_hash = ? AND deleted_at IS NULL LIMIT 1",
    )
    .bind(&user_id)
    .bind(&file_hash)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("duplicate check DB error: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if let Some(dup) = existing {
        tracing::info!("Upload perf: duplicate found in {:?}", t.elapsed());
        let _ = tokio::fs::remove_file(final_temp_path).await;
        return Ok(Json(MediaResponse::from_media(&dup)));
    }

    finalize_upload(
        &state,
        &claims,
        file_id,
        original_name,
        mime_type,
        file_hash,
        file_size,
        final_temp_path,
        thumb_data,
        session_id,
        total_start,
        t,
    )
    .await
}
