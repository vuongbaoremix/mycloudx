use cloudstore_cache::CacheEngine;
use cloudstore_sync::queue::SyncQueue;
use std::sync::Arc;
use cloudstore_sync::providers::CloudProvider;
use crate::metrics::AppMetrics;

/// Shared application state, injected into all route handlers via Axum.
#[derive(Clone)]
pub struct AppState {
    pub cache: CacheEngine,
    pub sync_queue: SyncQueue,
    pub provider: Option<Arc<dyn CloudProvider>>,
    /// API key for authentication. If None, auth is disabled.
    pub api_key: Option<String>,
    /// Application metrics.
    pub metrics: AppMetrics,
}
