use crate::providers::CloudProvider;
use crate::queue::SyncJob;
use crate::retry;
use cloudstore_common::{CloudStoreError, FileStatus};
use cloudstore_cache::CacheEngine;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{error, info, warn, debug};

/// Configuration for sync workers.
#[derive(Debug, Clone)]
pub struct WorkerConfig {
    pub worker_count: usize,
    pub retry_max: u32,
    pub retry_base_delay: Duration,
    pub retry_max_delay: Duration,
}

impl Default for WorkerConfig {
    fn default() -> Self {
        Self {
            worker_count: 4,
            retry_max: 5,
            retry_base_delay: Duration::from_secs(2),
            retry_max_delay: Duration::from_secs(120),
        }
    }
}

/// Shared atomic counters for sync metrics.
/// Created by the API crate and passed into `spawn_workers`.
#[derive(Debug, Clone)]
pub struct SyncMetrics {
    pub sync_success: Arc<AtomicU64>,
    pub sync_failure: Arc<AtomicU64>,
}

impl SyncMetrics {
    pub fn new(sync_success: Arc<AtomicU64>, sync_failure: Arc<AtomicU64>) -> Self {
        Self { sync_success, sync_failure }
    }

    fn inc_success(&self) { self.sync_success.fetch_add(1, Ordering::Relaxed); }
    fn inc_failure(&self) { self.sync_failure.fetch_add(1, Ordering::Relaxed); }
}

/// Spawn background sync workers that process jobs from the queue.
pub fn spawn_workers(
    mut receiver: mpsc::Receiver<SyncJob>,
    cache: CacheEngine,
    provider: Arc<dyn CloudProvider>,
    config: WorkerConfig,
    queue_sender: crate::queue::SyncQueue,
    metrics: Option<SyncMetrics>,
) -> tokio::task::JoinHandle<()> {
    let semaphore = Arc::new(tokio::sync::Semaphore::new(config.worker_count));

    tokio::spawn(async move {
        info!(
            workers = config.worker_count,
            "Sync worker pool started"
        );

        while let Some(job) = receiver.recv().await {
            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let cache = cache.clone();
            let provider = provider.clone();
            let config = config.clone();
            let queue = queue_sender.clone();
            let metrics = metrics.clone();

            tokio::spawn(async move {
                let result = process_job(&job, &cache, provider.as_ref()).await;

                match result {
                    Ok(cloud_url) => {
                        // Update metadata: status → synced.
                        if let Some(mut meta) = cache.get_meta(&job.path_id).await {
                            meta.status = FileStatus::Synced;
                            meta.cloud_url = Some(cloud_url);
                            meta.synced_at = Some(chrono::Utc::now());
                            if let Err(e) = cache.update_meta(&job.path_id, meta).await {
                                error!(
                                    path_id = %job.path_id,
                                    error = %e,
                                    "Failed to update meta after sync"
                                );
                            }
                        }
                        if let Some(ref m) = metrics { m.inc_success(); }
                        info!(path_id = %job.path_id, "File synced to cloud");
                    }
                    Err(e) => {
                        warn!(
                            path_id = %job.path_id,
                            attempt = job.retry_count,
                            error = %e,
                            "Sync failed"
                        );

                        // Retry logic.
                        if retry::should_retry(job.retry_count, config.retry_max) {
                            let delay = retry::backoff_delay(
                                job.retry_count,
                                config.retry_base_delay,
                                config.retry_max_delay,
                            );
                            tokio::time::sleep(delay).await;

                            let mut retry_job = job.clone();
                            retry_job.retry_count += 1;
                            let _ = queue.enqueue(retry_job).await;
                        } else {
                            // Max retries exhausted.
                            if let Some(ref m) = metrics { m.inc_failure(); }
                            error!(
                                path_id = %job.path_id,
                                "Sync permanently failed after {} attempts",
                                job.retry_count
                            );
                            if let Some(mut meta) = cache.get_meta(&job.path_id).await {
                                meta.status = FileStatus::SyncFailed;
                                meta.retry_count = job.retry_count;
                                let _ = cache.update_meta(&job.path_id, meta).await;
                            }
                        }
                    }
                }

                drop(permit);
            });
        }
    })
}

/// Process a single sync job: upload from cache file path to cloud.
async fn process_job(
    job: &SyncJob,
    cache: &CacheEngine,
    provider: &dyn CloudProvider,
) -> Result<String, CloudStoreError> {
    // Update status to syncing.
    if let Some(mut meta) = cache.get_meta(&job.path_id).await {
        meta.status = FileStatus::Syncing;
        cache.update_meta(&job.path_id, meta).await?;
    }

    // Content dedup: check if another file with the same hash is already synced.
    if let Some(meta) = cache.get_meta(&job.path_id).await {
        if let Some(existing_cloud_url) = cache.index().find_synced_by_hash(&meta.content_hash).await {
            debug!(
                path_id = %job.path_id,
                hash = %meta.content_hash,
                "Content dedup: reusing cloud URL from file with same hash"
            );
            return Ok(existing_cloud_url);
        }
    }

    // Get cache file path on disk (no RAM loading!).
    let local_path = cache.get_file_path(&job.path_id);
    if !local_path.exists() {
        return Err(CloudStoreError::NotFound(format!(
            "Cache file missing: {}",
            job.path_id
        )));
    }

    // Get mime type from meta.
    let mime_type = cache
        .get_meta(&job.path_id)
        .await
        .map(|m| m.mime_type)
        .unwrap_or_else(|| "application/octet-stream".to_string());

    // Upload directly from disk path — zero RAM copy.
    let cloud_url = provider
        .upload(job.path_id.path(), &local_path, &mime_type)
        .await?;

    Ok(cloud_url)
}
