use serde::{Deserialize, Serialize};
use std::fmt;
use std::path::{Path, PathBuf};

/// Path-based file identifier: `{provider}/{path}`
/// Example: `gdrive/photos/2026/photo.jpg`
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct PathId(String);

impl PathId {
    /// Create a new PathId from provider and path.
    pub fn new(provider: &str, path: &str) -> Result<Self, crate::errors::CloudStoreError> {
        let path = path.trim_start_matches('/');
        let provider = provider.trim();

        if provider.is_empty() {
            return Err(crate::errors::CloudStoreError::InvalidPath(
                "provider cannot be empty".into(),
            ));
        }
        if path.is_empty() {
            return Err(crate::errors::CloudStoreError::InvalidPath(
                "path cannot be empty".into(),
            ));
        }

        Self::validate_path(path)?;

        Ok(Self(format!("{}/{}", provider, path)))
    }

    /// Parse a full path-id string like `gdrive/photos/photo.jpg`
    pub fn parse(full_path: &str) -> Result<Self, crate::errors::CloudStoreError> {
        let full_path = full_path.trim_start_matches('/');
        let slash_pos = full_path.find('/').ok_or_else(|| {
            crate::errors::CloudStoreError::InvalidPath(
                "path must contain provider prefix (e.g. gdrive/path/to/file)".into(),
            )
        })?;

        let provider = &full_path[..slash_pos];
        let path = &full_path[slash_pos + 1..];

        Self::new(provider, path)
    }

    /// Validate path for security (no traversal, no null bytes, length limits).
    fn validate_path(path: &str) -> Result<(), crate::errors::CloudStoreError> {
        if path.contains('\0') {
            return Err(crate::errors::CloudStoreError::InvalidPath(
                "path contains null byte".into(),
            ));
        }
        if path.contains("..") {
            return Err(crate::errors::CloudStoreError::InvalidPath(
                "path traversal (..) is not allowed".into(),
            ));
        }
        for component in path.split('/') {
            if component.as_bytes().len() > 255 {
                return Err(crate::errors::CloudStoreError::InvalidPath(
                    "path component exceeds 255 bytes".into(),
                ));
            }
        }
        Ok(())
    }

    /// Get the provider prefix (e.g. `gdrive`).
    pub fn provider(&self) -> &str {
        let slash_pos = self.0.find('/').unwrap();
        &self.0[..slash_pos]
    }

    /// Get the path after provider (e.g. `photos/2026/photo.jpg`).
    pub fn path(&self) -> &str {
        let slash_pos = self.0.find('/').unwrap();
        &self.0[slash_pos + 1..]
    }

    /// Get the filename (last component).
    pub fn filename(&self) -> &str {
        self.path()
            .rsplit('/')
            .next()
            .unwrap_or(self.path())
    }

    /// Get the full path-id string.
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Convert to a filesystem path relative to a cache root.
    pub fn to_cache_path(&self, cache_root: &Path) -> PathBuf {
        cache_root.join(&self.0)
    }

    /// Get the `.meta.json` sidecar path relative to a cache root.
    pub fn to_meta_path(&self, cache_root: &Path) -> PathBuf {
        let mut path = self.to_cache_path(cache_root);
        let filename = path.file_name().unwrap().to_os_string();
        let meta_filename = format!("{}.meta.json", filename.to_string_lossy());
        path.set_file_name(meta_filename);
        path
    }
}

impl fmt::Display for PathId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// File sync status.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileStatus {
    /// Only on NVMe cache, not yet synced to cloud.
    Cached,
    /// Currently being uploaded to cloud.
    Syncing,
    /// Successfully synced to cloud.
    Synced,
    /// Sync failed, will retry.
    SyncFailed,
}

impl fmt::Display for FileStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FileStatus::Cached => write!(f, "cached"),
            FileStatus::Syncing => write!(f, "syncing"),
            FileStatus::Synced => write!(f, "synced"),
            FileStatus::SyncFailed => write!(f, "sync_failed"),
        }
    }
}

/// File metadata stored in `.meta.json` sidecar files.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMeta {
    /// Original filename.
    pub original_name: String,

    /// SHA-256 content hash.
    pub content_hash: String,

    /// File size in bytes.
    pub size_bytes: u64,

    /// MIME type.
    pub mime_type: String,

    /// Current sync status.
    pub status: FileStatus,

    /// URL on cloud provider (if synced).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cloud_url: Option<String>,

    /// Cloud provider name.
    pub cloud_provider: String,

    /// Creation timestamp.
    pub created_at: chrono::DateTime<chrono::Utc>,

    /// Sync completion timestamp.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub synced_at: Option<chrono::DateTime<chrono::Utc>>,

    /// Number of sync retry attempts.
    pub retry_count: u32,
}

impl FileMeta {
    /// Create a new FileMeta for a freshly cached file.
    pub fn new_cached(
        original_name: String,
        content_hash: String,
        size_bytes: u64,
        mime_type: String,
        cloud_provider: String,
    ) -> Self {
        Self {
            original_name,
            content_hash,
            size_bytes,
            mime_type,
            status: FileStatus::Cached,
            cloud_url: None,
            cloud_provider,
            created_at: chrono::Utc::now(),
            synced_at: None,
            retry_count: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_id_new() {
        let id = PathId::new("gdrive", "photos/2026/photo.jpg").unwrap();
        assert_eq!(id.provider(), "gdrive");
        assert_eq!(id.path(), "photos/2026/photo.jpg");
        assert_eq!(id.filename(), "photo.jpg");
        assert_eq!(id.as_str(), "gdrive/photos/2026/photo.jpg");
    }

    #[test]
    fn test_path_id_parse() {
        let id = PathId::parse("gdrive/documents/report.pdf").unwrap();
        assert_eq!(id.provider(), "gdrive");
        assert_eq!(id.path(), "documents/report.pdf");
    }

    #[test]
    fn test_path_id_with_spaces() {
        let id = PathId::new("gdrive", "My Photos/ảnh đẹp.jpg").unwrap();
        assert_eq!(id.path(), "My Photos/ảnh đẹp.jpg");
        assert_eq!(id.filename(), "ảnh đẹp.jpg");
    }

    #[test]
    fn test_path_id_rejects_traversal() {
        assert!(PathId::new("gdrive", "../etc/passwd").is_err());
        assert!(PathId::new("gdrive", "photos/../../secret").is_err());
    }

    #[test]
    fn test_path_id_rejects_empty() {
        assert!(PathId::new("", "file.txt").is_err());
        assert!(PathId::new("gdrive", "").is_err());
    }

    #[test]
    fn test_cache_path() {
        let id = PathId::new("gdrive", "photos/photo.jpg").unwrap();
        let cache_root = Path::new("/data/cache");
        assert_eq!(
            id.to_cache_path(cache_root),
            PathBuf::from("/data/cache/gdrive/photos/photo.jpg")
        );
    }

    #[test]
    fn test_meta_path() {
        let id = PathId::new("gdrive", "photos/photo.jpg").unwrap();
        let cache_root = Path::new("/data/cache");
        assert_eq!(
            id.to_meta_path(cache_root),
            PathBuf::from("/data/cache/gdrive/photos/photo.jpg.meta.json")
        );
    }
}
