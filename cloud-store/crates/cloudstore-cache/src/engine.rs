use cloudstore_common::{CloudStoreError, FileMeta, PathId};
use crate::hasher;
use crate::index::CacheIndex;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use tokio::fs;
use tracing::{debug, info, warn};
use walkdir::WalkDir;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::Row;

/// NVMe cache engine: manages file read/write and SQLite index.
#[derive(Clone)]
pub struct CacheEngine {
    /// Root directory for cached files.
    cache_root: PathBuf,
    /// SQLite backed index.
    index: CacheIndex,
    /// Optional max cache size for LRU eviction.
    max_size_bytes: Option<u64>,
}

impl CacheEngine {
    /// Create a new CacheEngine and run DB setup / json migration.
    pub async fn new(cache_root: PathBuf) -> Result<Self, CloudStoreError> {
        Self::create(cache_root, None).await
    }

    /// Create a new CacheEngine with a max cache size for LRU eviction.
    pub async fn with_max_size(
        cache_root: PathBuf,
        max_size_bytes: u64,
    ) -> Result<Self, CloudStoreError> {
        Self::create(cache_root, Some(max_size_bytes)).await
    }

    async fn create(
        cache_root: PathBuf,
        max_size_bytes: Option<u64>,
    ) -> Result<Self, CloudStoreError> {
        // Ensure cache root exists.
        fs::create_dir_all(&cache_root).await?;

        // Setup SQLite pool
        let db_path = cache_root.join("cache.db");
        let conn_str = format!(
            "sqlite://{}",
            db_path.display().to_string().replace('\\', "/")
        );

        let options = SqliteConnectOptions::from_str(&conn_str)
            .map_err(|e| CloudStoreError::ProviderError { provider: "sqlite".into(), message: e.to_string() })?
            .create_if_missing(true)
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await
            .map_err(|e| CloudStoreError::ProviderError { provider: "sqlite".into(), message: e.to_string() })?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS cache_meta (
                path_id TEXT PRIMARY KEY,
                original_name TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                mime_type TEXT NOT NULL,
                status TEXT NOT NULL,
                cloud_url TEXT,
                cloud_provider TEXT NOT NULL,
                is_encrypted BOOLEAN NOT NULL DEFAULT 0,
                encryption_iv TEXT,
                key_verification_hash TEXT,
                created_at TEXT NOT NULL,
                synced_at TEXT,
                retry_count INTEGER NOT NULL DEFAULT 0
            )",
        )
        .execute(&pool)
        .await
        .map_err(|e| CloudStoreError::ProviderError { provider: "sqlite".into(), message: e.to_string() })?;

        // Add missing columns if upgrading an existing database
        let _ = sqlx::query("ALTER TABLE cache_meta ADD COLUMN is_encrypted BOOLEAN NOT NULL DEFAULT 0").execute(&pool).await;
        let _ = sqlx::query("ALTER TABLE cache_meta ADD COLUMN encryption_iv TEXT").execute(&pool).await;
        let _ = sqlx::query("ALTER TABLE cache_meta ADD COLUMN key_verification_hash TEXT").execute(&pool).await;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_cache_content_hash ON cache_meta (content_hash)")
            .execute(&pool)
            .await
            .map_err(|e| CloudStoreError::ProviderError { provider: "sqlite".into(), message: e.to_string() })?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_cache_status ON cache_meta (status)")
            .execute(&pool)
            .await
            .map_err(|e| CloudStoreError::ProviderError { provider: "sqlite".into(), message: e.to_string() })?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_cache_created_at ON cache_meta (created_at)")
            .execute(&pool)
            .await
            .map_err(|e| CloudStoreError::ProviderError { provider: "sqlite".into(), message: e.to_string() })?;

        let index = CacheIndex::new(pool);
        let engine = Self { cache_root, index, max_size_bytes };

        // Migrate legacy .meta.json files if index is empty
        engine.migrate_legacy_json_to_sqlite().await?;

        Ok(engine)
    }

    /// Get a reference to the SQLite-backed index.
    pub fn index(&self) -> &CacheIndex {
        &self.index
    }

    /// Get the cache root path.
    pub fn cache_root(&self) -> &Path {
        &self.cache_root
    }

    /// Get the full file path for a given PathId (for direct disk access).
    pub fn get_file_path(&self, path_id: &PathId) -> PathBuf {
        path_id.to_cache_path(&self.cache_root)
    }

    /// Store a file from a byte slice (small files). Returns the FileMeta.
    pub async fn store(
        &self,
        path_id: &PathId,
        data: &[u8],
    ) -> Result<FileMeta, CloudStoreError> {
        let file_path = path_id.to_cache_path(&self.cache_root);

        // Ensure parent directories exist.
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        // Compute hash.
        let content_hash = hasher::hash_bytes(data);
        let size_bytes = data.len() as u64;

        // Detect MIME type.
        let mime_type = mime_guess::from_path(path_id.filename())
            .first_or_octet_stream()
            .to_string();

        // Write file data.
        fs::write(&file_path, data).await?;

        // Create metadata.
        let meta = FileMeta::new_cached(
            path_id.filename().to_string(),
            content_hash,
            size_bytes,
            mime_type,
            path_id.provider().to_string(),
        );

        // Update SQLite index.
        self.index.upsert(path_id, meta.clone()).await;

        info!(
            path_id = %path_id,
            size = size_bytes,
            "File stored in cache"
        );

        // Run eviction if cache is over limit.
        self.run_eviction().await;

        Ok(meta)
    }

    /// Store a file by streaming from an async body → disk.
    /// Writes chunks to disk while computing hash concurrently.
    /// RAM usage: only 1 chunk (~64KB) at a time, NOT the entire file.
    pub async fn store_stream<S, E>(
        &self,
        path_id: &PathId,
        mut stream: S,
    ) -> Result<FileMeta, CloudStoreError>
    where
        S: futures_util::Stream<Item = Result<bytes::Bytes, E>> + Unpin,
        E: std::fmt::Display,
    {
        use futures_util::StreamExt;
        use sha2::{Digest, Sha256};
        use tokio::io::AsyncWriteExt;

        let file_path = path_id.to_cache_path(&self.cache_root);

        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        let file = tokio::fs::File::create(&file_path).await?;
        let mut writer = tokio::io::BufWriter::with_capacity(256 * 1024, file);
        let mut hasher = Sha256::new();
        let mut size_bytes: u64 = 0;

        // Stream chunks: write to file + update hash, one chunk at a time.
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| {
                CloudStoreError::SyncError(format!("Stream read error: {}", e))
            })?;
            hasher.update(&chunk);
            size_bytes += chunk.len() as u64;
            writer.write_all(&chunk).await?;
        }

        writer.flush().await?;

        let content_hash = format!("{:x}", hasher.finalize());

        let mime_type = mime_guess::from_path(path_id.filename())
            .first_or_octet_stream()
            .to_string();

        let meta = FileMeta::new_cached(
            path_id.filename().to_string(),
            content_hash,
            size_bytes,
            mime_type,
            path_id.provider().to_string(),
        );

        // Update SQLite index.
        self.index.upsert(path_id, meta.clone()).await;

        info!(path_id = %path_id, size = size_bytes, "File streamed to cache");

        // Run eviction if cache is over limit.
        self.run_eviction().await;

        Ok(meta)
    }

    /// Read file content from cache.
    pub async fn retrieve(&self, path_id: &PathId) -> Result<Vec<u8>, CloudStoreError> {
        let file_path = path_id.to_cache_path(&self.cache_root);

        if !file_path.exists() {
            return Err(CloudStoreError::NotFound(path_id.to_string()));
        }

        let data = fs::read(&file_path).await?;
        debug!(path_id = %path_id, size = data.len(), "File read from cache");
        Ok(data)
    }

    /// Check if a file exists in cache on disk.
    pub async fn file_exists_on_disk(&self, path_id: &PathId) -> bool {
        let file_path = path_id.to_cache_path(&self.cache_root);
        fs::metadata(&file_path).await.is_ok()
    }

    /// Get file metadata from the index.
    pub async fn get_meta(&self, path_id: &PathId) -> Option<FileMeta> {
        self.index.get(path_id).await
    }

    /// Update file metadata (index).
    pub async fn update_meta(
        &self,
        path_id: &PathId,
        meta: FileMeta,
    ) -> Result<(), CloudStoreError> {
        self.index.upsert(path_id, meta).await;
        Ok(())
    }

    /// Delete a file from cache (both data file and index).
    pub async fn delete(&self, path_id: &PathId) -> Result<Option<FileMeta>, CloudStoreError> {
        let file_path = path_id.to_cache_path(&self.cache_root);

        // Remove from index first.
        let removed = self.index.remove(path_id).await;

        // Delete files from disk (ignore "not found" errors).
        let _ = fs::remove_file(&file_path).await;

        // Try to clean up empty parent directories.
        if let Some(parent) = file_path.parent() {
            let _ = Self::cleanup_empty_dirs(parent, &self.cache_root).await;
        }

        info!(path_id = %path_id, "File deleted from cache");
        Ok(removed)
    }

    /// List files under a provider/prefix.
    pub async fn list(
        &self,
        provider: &str,
        prefix: Option<&str>,
    ) -> Vec<(String, FileMeta)> {
        self.index.list(provider, prefix).await
    }

    /// Migrate legacy `.meta.json` files to SQLite table if table is empty.
    async fn migrate_legacy_json_to_sqlite(&self) -> Result<(), CloudStoreError> {
        if self.index.len().await > 0 {
            return Ok(());
        }

        let cache_root = self.cache_root.clone();

        let entries = tokio::task::spawn_blocking(move || {
            let mut entries = Vec::new();
            for entry in WalkDir::new(&cache_root)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("json")
                    && path
                        .file_name()
                        .and_then(|f| f.to_str())
                        .map(|f| f.ends_with(".meta.json"))
                        .unwrap_or(false)
                {
                    entries.push(path.to_path_buf());
                }
            }
            entries
        })
        .await
        .map_err(|e| CloudStoreError::Io(std::io::Error::new(std::io::ErrorKind::Other, e)))?;

        if entries.is_empty() {
            return Ok(());
        }

        info!("Starting migration of {} .meta.json files to SQLite...", entries.len());

        let mut count = 0;
        for meta_path in &entries {
            match self.read_meta_file(meta_path).await {
                Ok((path_id_str, meta)) => {
                    if let Ok(path_id) = PathId::parse(&path_id_str) {
                        self.index.upsert(&path_id, meta).await;
                        count += 1;
                    }
                }
                Err(e) => {
                    warn!(path = %meta_path.display(), error = %e, "Failed to read meta file");
                }
            }
        }
        
        // Clean up the JSON files after migration
        for meta_path in &entries {
            let _ = fs::remove_file(meta_path).await;
        }

        info!(count, "Migrated .meta.json files to SQLite and deleted JSONs");
        Ok(())
    }

    /// Read a `.meta.json` file and derive the PathId from its filesystem path.
    async fn read_meta_file(
        &self,
        meta_path: &Path,
    ) -> Result<(String, FileMeta), CloudStoreError> {
        let content = fs::read_to_string(meta_path).await?;
        let meta: FileMeta = serde_json::from_str(&content)?;

        let relative = meta_path
            .strip_prefix(&self.cache_root)
            .map_err(|_| {
                CloudStoreError::InvalidPath(format!(
                    "meta file not under cache root: {}",
                    meta_path.display()
                ))
            })?;

        let path_str = relative.to_string_lossy().replace('\\', "/");
        let path_id_str = path_str
            .strip_suffix(".meta.json")
            .ok_or_else(|| {
                CloudStoreError::InvalidPath(format!("invalid meta filename: {}", path_str))
            })?
            .to_string();

        Ok((path_id_str, meta))
    }

    /// Recursively remove empty directories up to (but not including) the stop directory.
    async fn cleanup_empty_dirs(dir: &Path, stop_at: &Path) -> Result<(), std::io::Error> {
        let mut current = dir.to_path_buf();
        while current != stop_at {
            match fs::remove_dir(&current).await {
                Ok(_) => {
                    debug!(dir = %current.display(), "Removed empty directory");
                    if let Some(parent) = current.parent() {
                        current = parent.to_path_buf();
                    } else {
                        break;
                    }
                }
                Err(_) => break, // Directory not empty or other error.
            }
        }
        Ok(())
    }

    /// Run LRU eviction if cache exceeds max size based on SQLite status.
    async fn run_eviction(&self) {
        let target_size = match self.max_size_bytes {
            Some(s) => s,
            None => return,
        };

        let current_size = self.index.total_size_bytes().await;
        if current_size <= target_size {
            return;
        }

        let overage = current_size - target_size;
        let rows = sqlx::query("SELECT path_id, size_bytes FROM cache_meta WHERE status = 'synced' ORDER BY created_at ASC")
            .fetch_all(&self.index.pool)
            .await
            .unwrap_or_default();

        let mut freed: u64 = 0;
        for row in rows {
            if freed >= overage {
                break;
            }

            let path_id_str: String = row.try_get("path_id").unwrap_or_default();
            let size_bytes: i64 = row.try_get("size_bytes").unwrap_or(0);
            
            if let Ok(path_id) = PathId::parse(&path_id_str) {
                let file_path = path_id.to_cache_path(&self.cache_root);
                if fs::remove_file(&file_path).await.is_ok() {
                    freed += size_bytes as u64;
                    info!(path_id = %path_id_str, size = size_bytes, "Evicted cached file (data only)");
                }
            }
        }

        if freed > 0 {
            info!(freed_bytes = freed, "Cache eviction complete");
        }
    }

    /// Start a background task that periodically runs LRU eviction.
    pub fn start_eviction_task(
        &self,
        interval: std::time::Duration,
    ) -> tokio::task::JoinHandle<()> {
        let engine = self.clone();
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(interval);
            ticker.tick().await; // Skip the first immediate tick.
            loop {
                ticker.tick().await;
                engine.run_eviction().await;
            }
        })
    }
}
