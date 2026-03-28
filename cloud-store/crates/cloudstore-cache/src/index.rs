use cloudstore_common::{CloudStoreError, FileMeta, PathId};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;

/// In-memory index of all file metadata.
/// Built on startup by scanning `.meta.json` files, kept in sync during runtime.
#[derive(Debug, Clone)]
pub struct CacheIndex {
    inner: Arc<RwLock<HashMap<String, FileMeta>>>,
    total_size: Arc<AtomicU64>,
}

impl CacheIndex {
    /// Create a new empty index.
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(HashMap::new())),
            total_size: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Create an index pre-populated with entries.
    pub fn with_entries(entries: HashMap<String, FileMeta>) -> Self {
        let size: u64 = entries.values().map(|m| m.size_bytes).sum();
        Self {
            inner: Arc::new(RwLock::new(entries)),
            total_size: Arc::new(AtomicU64::new(size)),
        }
    }

    /// Insert or update a file metadata entry.
    pub async fn upsert(&self, path_id: &PathId, meta: FileMeta) {
        let mut map = self.inner.write().await;
        let old_size = map.insert(path_id.as_str().to_string(), meta.clone())
            .map(|m| m.size_bytes)
            .unwrap_or(0);
        
        if old_size != meta.size_bytes {
            if old_size > 0 {
                self.total_size.fetch_sub(old_size, Ordering::Relaxed);
            }
            if meta.size_bytes > 0 {
                self.total_size.fetch_add(meta.size_bytes, Ordering::Relaxed);
            }
        }
    }

    /// Get file metadata by path ID.
    pub async fn get(&self, path_id: &PathId) -> Option<FileMeta> {
        let map = self.inner.read().await;
        map.get(path_id.as_str()).cloned()
    }

    /// Remove a file metadata entry.
    pub async fn remove(&self, path_id: &PathId) -> Option<FileMeta> {
        let mut map = self.inner.write().await;
        if let Some(meta) = map.remove(path_id.as_str()) {
            self.total_size.fetch_sub(meta.size_bytes, Ordering::Relaxed);
            Some(meta)
        } else {
            None
        }
    }

    /// Check if a path ID exists in the index.
    pub async fn contains(&self, path_id: &PathId) -> bool {
        let map = self.inner.read().await;
        map.contains_key(path_id.as_str())
    }

    /// Get the total number of entries.
    pub async fn len(&self) -> usize {
        let map = self.inner.read().await;
        map.len()
    }

    /// Check if the index is empty.
    pub async fn is_empty(&self) -> bool {
        let map = self.inner.read().await;
        map.is_empty()
    }

    /// List all entries matching a provider and optional path prefix.
    pub async fn list(
        &self,
        provider: &str,
        prefix: Option<&str>,
    ) -> Vec<(String, FileMeta)> {
        let map = self.inner.read().await;
        let search_prefix = match prefix {
            Some(p) => format!("{}/{}", provider, p.trim_start_matches('/')),
            None => format!("{}/", provider),
        };
        map.iter()
            .filter(|(k, _)| k.starts_with(&search_prefix))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    }

    /// List entries by status.
    pub async fn list_by_status(
        &self,
        status: &cloudstore_common::FileStatus,
    ) -> Vec<(String, FileMeta)> {
        let map = self.inner.read().await;
        map.iter()
            .filter(|(_, v)| &v.status == status)
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    }

    /// Get total cached size in bytes.
    pub async fn total_size_bytes(&self) -> u64 {
        self.total_size.load(Ordering::Relaxed)
    }

    /// Update a specific entry using a closure.
    pub async fn update<F>(&self, path_id: &PathId, updater: F) -> Result<(), CloudStoreError>
    where
        F: FnOnce(&mut FileMeta),
    {
        let mut map = self.inner.write().await;
        let entry = map
            .get_mut(path_id.as_str())
            .ok_or_else(|| CloudStoreError::NotFound(path_id.to_string()))?;
        
        let old_size = entry.size_bytes;
        updater(entry);
        let new_size = entry.size_bytes;
        
        if old_size != new_size {
            if old_size > 0 {
                self.total_size.fetch_sub(old_size, Ordering::Relaxed);
            }
            if new_size > 0 {
                self.total_size.fetch_add(new_size, Ordering::Relaxed);
            }
        }
        Ok(())
    }

    /// Find ANY Synced entry with the given content hash (for dedup).
    /// Returns the cloud_url if found.
    pub async fn find_synced_by_hash(&self, content_hash: &str) -> Option<String> {
        let map = self.inner.read().await;
        map.values()
            .find(|m| {
                m.status == cloudstore_common::FileStatus::Synced
                    && m.content_hash == content_hash
                    && m.cloud_url.is_some()
            })
            .and_then(|m| m.cloud_url.clone())
    }
}

impl Default for CacheIndex {
    fn default() -> Self {
        Self::new()
    }
}
