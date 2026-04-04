use anyhow::Result;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc;

use crate::db::DbPool;
use crate::imaging::thumbnail;
use crate::storage::StorageProvider;
use crate::metrics::AppMetrics;
use std::sync::atomic::Ordering;

/// A single processing job — only path strings, no raw image data in memory.
#[derive(Debug, Clone)]
pub struct ProcessJob {
    pub record_id: String,
    /// Temp file path on disk (e.g. uploads/tmp/<uuid>.bin)
    pub temp_path: PathBuf,
    pub storage_path: String,
    pub mime_type: String,
    pub video_thumb_path: Option<PathBuf>,
    pub orientation: Option<i32>,
    /// Optional DEK (hex) for encrypting uploads to CloudStore
    pub encryption_key: Option<String>,
}

/// A handle to the processing queue.
/// Cheap to clone — backed by an unbounded mpsc channel.
#[derive(Clone)]
pub struct ProcessingQueue {
    sender: mpsc::UnboundedSender<ProcessJob>,
    metrics: AppMetrics,
}

impl ProcessingQueue {
    /// Enqueue a job. Never blocks, never fails (unbounded channel).
    /// The job only carries path strings — raw image data stays on disk.
    pub fn enqueue(&self, job: ProcessJob) {
        if self.sender.send(job).is_ok() {
            self.metrics.jobs_pending.fetch_add(1, Ordering::Relaxed);
        }
    }
}

/// Start `worker_count` background workers and return a queue handle.
///
/// Workers share the same storage + DB handles via Arc.
/// Each worker reads temp files from disk when it's ready to process them,
/// keeping in-memory image data to a minimum (one image per worker at a time).
pub fn start_workers(
    worker_count: usize,
    db: DbPool,
    storage: Arc<dyn StorageProvider>,
    metrics: AppMetrics,
) -> ProcessingQueue {
    let (tx, rx) = mpsc::unbounded_channel::<ProcessJob>();
    let rx = Arc::new(tokio::sync::Mutex::new(rx));

    for worker_id in 0..worker_count {
        let rx = rx.clone();
        let db = db.clone();
        let storage = storage.clone();
        let worker_metrics = metrics.clone();

        tokio::spawn(async move {
            tracing::info!("Upload worker {} started", worker_id);
            loop {
                let job = {
                    let mut guard = rx.lock().await;
                    guard.recv().await
                };

                let Some(job) = job else {
                    tracing::info!("Upload worker {} shutting down", worker_id);
                    break;
                };
                
                worker_metrics.jobs_pending.fetch_sub(1, Ordering::Relaxed);
                worker_metrics.jobs_processing.fetch_add(1, Ordering::Relaxed);

                tracing::info!(
                    "Worker {}: starting job {} ({})",
                    worker_id,
                    job.record_id,
                    job.mime_type
                );

                if let Err(e) = process_job(&job, &db, &storage, &worker_metrics).await {
                    tracing::error!(
                        "Worker {}: job {} failed: {}",
                        worker_id,
                        job.record_id,
                        e
                    );
                    let _ = sqlx::query(
                        "UPDATE media SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    )
                    .bind(&job.record_id)
                    .execute(&db)
                    .await;
                }

                worker_metrics.jobs_processing.fetch_sub(1, Ordering::Relaxed);
                worker_metrics.jobs_completed.fetch_add(1, Ordering::Relaxed);

                // Always remove the temp file after processing (success or failure)
                if let Err(e) = tokio::fs::remove_file(&job.temp_path).await {
                    tracing::warn!(
                        "Worker {}: could not remove temp file {:?}: {}",
                        worker_id,
                        job.temp_path,
                        e
                    );
                }
            }
        });
    }

    ProcessingQueue { sender: tx, metrics }
}

async fn process_job(
    job: &ProcessJob,
    db: &DbPool,
    storage: &Arc<dyn StorageProvider>,
    metrics: &AppMetrics,
) -> Result<()> {
    let start = std::time::Instant::now();

    // Read from local disk — fast, bounded by worker count
    let t = std::time::Instant::now();
    let data = bytes::Bytes::from(tokio::fs::read(&job.temp_path).await?);
    metrics.bytes_processed.fetch_add(data.len() as u64, Ordering::Relaxed);
    
    tracing::info!(
        "Worker job {}: disk read {} KB in {:?}",
        job.record_id, data.len() / 1024, t.elapsed()
    );

    if job.mime_type.starts_with("image/") {
        // Upload original and generate thumbnails in parallel
        let t_upload = std::time::Instant::now();
        let t_thumb = std::time::Instant::now();

        let (upload_res, thumb_res) = tokio::join!(
            {
                let d = data.clone();
                let s = storage.clone();
                let p = job.storage_path.clone();
                let ek = job.encryption_key.clone();
                async move {
                    let r = upload_original_encrypted(&d, &p, &s, ek.as_deref()).await;
                    tracing::info!("Worker job {}: upload original done in {:?}", job.record_id, t_upload.elapsed());
                    r
                }
            },
            {
                let d = data.clone();
                let st = storage.clone();
                let p = job.storage_path.clone();
                let id = job.record_id.clone();
                let ori = job.orientation;
                let ek = job.encryption_key.clone();
                async move {
                    let r = thumbnail::generate_thumbnails(d, p, st, ori, ek).await;
                    tracing::info!("Worker job {}: thumbnails done in {:?}", id, t_thumb.elapsed());
                    r
                }
            }
        );

        upload_res?;
        let thumb = thumb_res?;
        update_media_with_thumbnails(db, &job.record_id, &thumb).await?;
    } else if job.mime_type.starts_with("video/") {
        if let Some(thumb_path) = &job.video_thumb_path {
            match tokio::fs::read(thumb_path).await {
                Ok(thumb_bytes) => {
                    let thumb_data = bytes::Bytes::from(thumb_bytes);
                    let t_upload = std::time::Instant::now();
                    let t_thumb = std::time::Instant::now();

                    let (upload_res, thumb_res) = tokio::join!(
                        {
                            let d = data.clone();
                            let s = storage.clone();
                            let p = job.storage_path.clone();
                            let ek = job.encryption_key.clone();
                            async move {
                                let r = upload_original_encrypted(&d, &p, &s, ek.as_deref()).await;
                                tracing::info!("Worker job {}: video upload done in {:?}", job.record_id, t_upload.elapsed());
                                r
                            }
                        },
                        thumbnail::generate_thumbnails(thumb_data, job.storage_path.clone(), storage.clone(), None, job.encryption_key.clone())
                    );

                    upload_res?;

                    if let Ok(thumb) = thumb_res {
                        tracing::info!("Worker job {}: video thumb done in {:?}", job.record_id, t_thumb.elapsed());
                        update_media_with_thumbnails(db, &job.record_id, &thumb).await?;
                    } else {
                        mark_ready(db, &job.record_id).await?;
                    }
                }
                Err(e) => {
                    tracing::error!("Worker job {}: read frontend thumb failed: {}", job.record_id, e);
                    upload_original_encrypted(&data, &job.storage_path, storage, job.encryption_key.as_deref()).await?;
                    mark_ready(db, &job.record_id).await?;
                }
            }
            
            // Cleanup thumb file
            let _ = tokio::fs::remove_file(thumb_path).await;
        } else {
            upload_original_encrypted(&data, &job.storage_path, storage, job.encryption_key.as_deref()).await?;
            mark_ready(db, &job.record_id).await?;
        }
    } else {
        upload_original_encrypted(&data, &job.storage_path, storage, job.encryption_key.as_deref()).await?;
        mark_ready(db, &job.record_id).await?;
    }

    tracing::info!(
        "Worker job {}: TOTAL {:?}",
        job.record_id,
        start.elapsed()
    );
    Ok(())
}


async fn upload_original_encrypted(
    data: &[u8],
    storage_path: &str,
    storage: &Arc<dyn StorageProvider>,
    encryption_key: Option<&str>,
) -> Result<()> {
    storage.upload_encrypted(data, storage_path, encryption_key).await?;
    Ok(())
}

async fn update_media_with_thumbnails(
    db: &DbPool,
    record_id: &str,
    thumb: &thumbnail::ThumbnailResult,
) -> Result<()> {
    let thumbs_str = serde_json::to_string(&serde_json::json!({
        "micro": thumb.micro,
        "small": thumb.small,
        "medium": thumb.medium,
        "large": thumb.large,
        "web": thumb.web,
    }))?;

    sqlx::query(
        "UPDATE media SET width = ?, height = ?, aspect_ratio = ?, blur_hash = ?, \
         thumbnails = ?, status = 'ready', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(thumb.width as i32)
    .bind(thumb.height as i32)
    .bind(thumb.aspect_ratio)
    .bind(&thumb.blur_hash)
    .bind(&thumbs_str)
    .bind(record_id)
    .execute(db)
    .await?;
    Ok(())
}

async fn mark_ready(db: &DbPool, record_id: &str) -> Result<()> {
    sqlx::query(
        "UPDATE media SET status = 'ready', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(record_id)
    .execute(db)
    .await?;
    Ok(())
}
