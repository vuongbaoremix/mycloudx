use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

/// Application-level metrics using atomic counters.
/// Zero external dependencies — lightweight and lock-free.
#[derive(Debug, Clone)]
pub struct AppMetrics {
    inner: Arc<MetricsInner>,
}

#[derive(Debug)]
struct MetricsInner {
    uploads: AtomicU64,
    downloads_cache: AtomicU64,
    downloads_cloud: AtomicU64,
    deletes: AtomicU64,
    sync_success: Arc<AtomicU64>,
    sync_failure: Arc<AtomicU64>,
    bytes_uploaded: AtomicU64,
    bytes_downloaded: AtomicU64,
}

impl AppMetrics {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(MetricsInner {
                uploads: AtomicU64::new(0),
                downloads_cache: AtomicU64::new(0),
                downloads_cloud: AtomicU64::new(0),
                deletes: AtomicU64::new(0),
                sync_success: Arc::new(AtomicU64::new(0)),
                sync_failure: Arc::new(AtomicU64::new(0)),
                bytes_uploaded: AtomicU64::new(0),
                bytes_downloaded: AtomicU64::new(0),
            }),
        }
    }

    pub fn inc_uploads(&self) { self.inner.uploads.fetch_add(1, Ordering::Relaxed); }
    pub fn inc_downloads_cache(&self) { self.inner.downloads_cache.fetch_add(1, Ordering::Relaxed); }
    pub fn inc_downloads_cloud(&self) { self.inner.downloads_cloud.fetch_add(1, Ordering::Relaxed); }
    pub fn inc_deletes(&self) { self.inner.deletes.fetch_add(1, Ordering::Relaxed); }
    pub fn add_bytes_uploaded(&self, bytes: u64) { self.inner.bytes_uploaded.fetch_add(bytes, Ordering::Relaxed); }
    pub fn add_bytes_downloaded(&self, bytes: u64) { self.inner.bytes_downloaded.fetch_add(bytes, Ordering::Relaxed); }

    /// Get shared sync success counter (same Arc used by workers).
    pub fn sync_success_counter(&self) -> Arc<AtomicU64> { self.inner.sync_success.clone() }
    /// Get shared sync failure counter (same Arc used by workers).
    pub fn sync_failure_counter(&self) -> Arc<AtomicU64> { self.inner.sync_failure.clone() }

    /// Render metrics in Prometheus exposition text format.
    pub fn to_prometheus(&self) -> String {
        let m = &self.inner;
        format!(
            "# HELP cloudstore_uploads_total Total file uploads.\n\
             # TYPE cloudstore_uploads_total counter\n\
             cloudstore_uploads_total {}\n\
             # HELP cloudstore_downloads_cache_total Downloads served from cache.\n\
             # TYPE cloudstore_downloads_cache_total counter\n\
             cloudstore_downloads_cache_total {}\n\
             # HELP cloudstore_downloads_cloud_total Downloads fetched from cloud.\n\
             # TYPE cloudstore_downloads_cloud_total counter\n\
             cloudstore_downloads_cloud_total {}\n\
             # HELP cloudstore_deletes_total Total file deletes.\n\
             # TYPE cloudstore_deletes_total counter\n\
             cloudstore_deletes_total {}\n\
             # HELP cloudstore_sync_success_total Successful cloud syncs.\n\
             # TYPE cloudstore_sync_success_total counter\n\
             cloudstore_sync_success_total {}\n\
             # HELP cloudstore_sync_failure_total Failed cloud syncs.\n\
             # TYPE cloudstore_sync_failure_total counter\n\
             cloudstore_sync_failure_total {}\n\
             # HELP cloudstore_bytes_uploaded_total Total bytes uploaded.\n\
             # TYPE cloudstore_bytes_uploaded_total counter\n\
             cloudstore_bytes_uploaded_total {}\n\
             # HELP cloudstore_bytes_downloaded_total Total bytes downloaded.\n\
             # TYPE cloudstore_bytes_downloaded_total counter\n\
             cloudstore_bytes_downloaded_total {}\n",
            m.uploads.load(Ordering::Relaxed),
            m.downloads_cache.load(Ordering::Relaxed),
            m.downloads_cloud.load(Ordering::Relaxed),
            m.deletes.load(Ordering::Relaxed),
            m.sync_success.load(Ordering::Relaxed),
            m.sync_failure.load(Ordering::Relaxed),
            m.bytes_uploaded.load(Ordering::Relaxed),
            m.bytes_downloaded.load(Ordering::Relaxed),
        )
    }
}

impl Default for AppMetrics {
    fn default() -> Self {
        Self::new()
    }
}
