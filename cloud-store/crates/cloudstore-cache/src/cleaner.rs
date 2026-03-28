use crate::index::CacheIndex;
use cloudstore_common::FileStatus;

/// Cache cleaner with LRU eviction policy.
/// Evicts `Synced` files when cache exceeds the configured max size.
#[derive(Clone)]
pub struct CacheCleaner {
    max_size_bytes: u64,
}

impl CacheCleaner {
    pub fn new(max_size_bytes: u64) -> Self {
        Self { max_size_bytes }
    }

    /// Get the configured max size in bytes.
    pub fn max_size_bytes(&self) -> u64 {
        self.max_size_bytes
    }

    /// Check if eviction is needed based on current cache size.
    pub async fn needs_eviction(&self, index: &CacheIndex) -> bool {
        let total = index.total_size_bytes().await;
        total > self.max_size_bytes
    }

    /// Get the list of synced files sorted by creation time (oldest first).
    /// These are candidates for eviction (only evict files already on cloud).
    pub async fn eviction_candidates(
        &self,
        index: &CacheIndex,
    ) -> Vec<(String, u64)> {
        let mut synced = index.list_by_status(&FileStatus::Synced).await;
        synced.sort_by(|a, b| a.1.created_at.cmp(&b.1.created_at));
        synced
            .into_iter()
            .map(|(path_id, meta)| (path_id, meta.size_bytes))
            .collect()
    }
}
