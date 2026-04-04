use cloudstore_common::{CloudStoreError, FileMeta, FileStatus, PathId};
use sqlx::{Row, SqlitePool};

/// SQLite-backed index of all file metadata.
#[derive(Clone, Debug)]
pub struct CacheIndex {
    pub pool: SqlitePool,
}

impl CacheIndex {
    /// Create a new index wrapping a sqlite pool.
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Insert or update a file metadata entry.
    pub async fn upsert(&self, path_id: &PathId, meta: FileMeta) {
        let status_str = meta.status.to_string();
        
        let res = sqlx::query(
            "INSERT INTO cache_meta (
                path_id, original_name, content_hash, size_bytes, mime_type, status,
                cloud_url, cloud_provider, is_encrypted, encryption_iv, key_verification_hash, created_at, synced_at, retry_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path_id) DO UPDATE SET
                original_name = excluded.original_name,
                content_hash = excluded.content_hash,
                size_bytes = excluded.size_bytes,
                mime_type = excluded.mime_type,
                status = excluded.status,
                cloud_url = excluded.cloud_url,
                cloud_provider = excluded.cloud_provider,
                is_encrypted = excluded.is_encrypted,
                encryption_iv = excluded.encryption_iv,
                key_verification_hash = excluded.key_verification_hash,
                created_at = excluded.created_at,
                synced_at = excluded.synced_at,
                retry_count = excluded.retry_count"
        )
        .bind(path_id.as_str())
        .bind(&meta.original_name)
        .bind(&meta.content_hash)
        .bind(meta.size_bytes as i64)
        .bind(&meta.mime_type)
        .bind(&status_str)
        .bind(&meta.cloud_url)
        .bind(&meta.cloud_provider)
        .bind(meta.is_encrypted)
        .bind(&meta.encryption_iv)
        .bind(&meta.key_verification_hash)
        .bind(&meta.created_at)
        .bind(&meta.synced_at)
        .bind(meta.retry_count as i64)
        .execute(&self.pool)
        .await;

        if let Err(e) = res {
            tracing::error!("Failed to upsert cache_meta for {}: {}", path_id, e);
        }
    }

    /// Get file metadata by path ID.
    pub async fn get(&self, path_id: &PathId) -> Option<FileMeta> {
        let row = sqlx::query("SELECT * FROM cache_meta WHERE path_id = ?")
            .bind(path_id.as_str())
            .fetch_optional(&self.pool)
            .await
            .ok()??;

        Self::map_row(&row)
    }

    /// Remove a file metadata entry.
    pub async fn remove(&self, path_id: &PathId) -> Option<FileMeta> {
        // Need to return it before deleting (or just select then delete)
        let meta = self.get(path_id).await;
        if meta.is_some() {
            let _ = sqlx::query("DELETE FROM cache_meta WHERE path_id = ?")
                .bind(path_id.as_str())
                .execute(&self.pool)
                .await;
        }
        meta
    }

    /// Check if a path ID exists in the index.
    pub async fn contains(&self, path_id: &PathId) -> bool {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(1) FROM cache_meta WHERE path_id = ?")
            .bind(path_id.as_str())
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);
        count > 0
    }

    /// Get the total number of entries.
    pub async fn len(&self) -> usize {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(1) FROM cache_meta")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);
        count as usize
    }

    /// Check if the index is empty.
    pub async fn is_empty(&self) -> bool {
        self.len().await == 0
    }

    /// List all entries matching a provider and optional path prefix.
    pub async fn list(
        &self,
        provider: &str,
        prefix: Option<&str>,
    ) -> Vec<(String, FileMeta)> {
        let search_prefix = match prefix {
            Some(p) => format!("{}/{}%", provider, p.trim_start_matches('/')),
            None => format!("{}/%", provider),
        };

        let rows = sqlx::query("SELECT * FROM cache_meta WHERE path_id LIKE ? AND cloud_provider = ?")
            .bind(&search_prefix)
            .bind(provider)
            .fetch_all(&self.pool)
            .await
            .unwrap_or_default();

        rows.into_iter()
            .filter_map(|row| {
                let path_id: String = row.try_get("path_id").ok()?;
                let meta = Self::map_row(&row)?;
                Some((path_id, meta))
            })
            .collect()
    }

    /// List entries by status.
    pub async fn list_by_status(
        &self,
        status: &FileStatus,
    ) -> Vec<(String, FileMeta)> {
        let status_str = status.to_string();
        let rows = sqlx::query("SELECT * FROM cache_meta WHERE status = ?")
            .bind(&status_str)
            .fetch_all(&self.pool)
            .await
            .unwrap_or_default();

        rows.into_iter()
            .filter_map(|row| {
                let path_id: String = row.try_get("path_id").ok()?;
                let meta = Self::map_row(&row)?;
                Some((path_id, meta))
            })
            .collect()
    }

    /// Get total cached size in bytes.
    pub async fn total_size_bytes(&self) -> u64 {
        let total: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(size_bytes), 0) FROM cache_meta")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);
        total as u64
    }

    /// Update a specific entry using a closure.
    pub async fn update<F>(&self, path_id: &PathId, updater: F) -> Result<(), CloudStoreError>
    where
        F: FnOnce(&mut FileMeta),
    {
        let mut meta = self
            .get(path_id)
            .await
            .ok_or_else(|| CloudStoreError::NotFound(path_id.to_string()))?;
        
        updater(&mut meta);
        self.upsert(path_id, meta).await;
        Ok(())
    }

    /// Find ANY Synced entry with the given content hash (for dedup).
    /// Returns the cloud_url if found.
    pub async fn find_synced_by_hash(&self, content_hash: &str) -> Option<String> {
        let status_str = FileStatus::Synced.to_string();
        sqlx::query_scalar(
            "SELECT cloud_url FROM cache_meta WHERE content_hash = ? AND status = ? AND cloud_url IS NOT NULL LIMIT 1"
        )
        .bind(content_hash)
        .bind(&status_str)
        .fetch_optional(&self.pool)
        .await
        .unwrap_or(None)
    }

    fn map_row(row: &sqlx::sqlite::SqliteRow) -> Option<FileMeta> {
        let status_str: String = row.try_get("status").ok()?;
        let status = match status_str.as_str() {
            "cached" => FileStatus::Cached,
            "syncing" => FileStatus::Syncing,
            "synced" => FileStatus::Synced,
            "sync_failed" => FileStatus::SyncFailed,
            _ => FileStatus::Cached,
        };

        Some(FileMeta {
            original_name: row.try_get("original_name").ok()?,
            content_hash: row.try_get("content_hash").ok()?,
            size_bytes: row.try_get::<i64, _>("size_bytes").ok()? as u64,
            mime_type: row.try_get("mime_type").ok()?,
            status,
            cloud_url: row.try_get("cloud_url").ok()?,
            cloud_provider: row.try_get("cloud_provider").ok()?,
            is_encrypted: row.try_get("is_encrypted").unwrap_or(false),
            encryption_iv: row.try_get("encryption_iv").ok()?,
            key_verification_hash: row.try_get("key_verification_hash").ok()?,
            created_at: row.try_get("created_at").ok()?,
            synced_at: row.try_get("synced_at").ok()?,
            retry_count: row.try_get::<i64, _>("retry_count").ok()? as u32,
        })
    }
}

