pub mod cloudstore;
pub mod local;

use anyhow::Result;
use std::path::Path;

#[derive(Debug, Clone, Copy)]
pub enum ThumbnailSize {
    Micro,
    Small,
    Medium,
    Large,
    Web,
}

impl ThumbnailSize {
    pub fn as_str(&self) -> &str {
        match self {
            ThumbnailSize::Micro => "micro",
            ThumbnailSize::Small => "small",
            ThumbnailSize::Medium => "medium",
            ThumbnailSize::Large => "large",
            ThumbnailSize::Web => "web",
        }
    }

    pub fn pixels(&self) -> u32 {
        match self {
            ThumbnailSize::Micro => 50,
            ThumbnailSize::Small => 150,
            ThumbnailSize::Medium => 400,
            ThumbnailSize::Large => 800,
            ThumbnailSize::Web => 1920,
        }
    }
}

pub struct StorageResult {
    pub path: String,
    pub size: u64,
    pub url: String,
}

#[async_trait::async_trait]
pub trait StorageProvider: Send + Sync {
    /// Upload file data to the given path
    async fn upload(&self, data: &[u8], path: &str) -> Result<StorageResult>;

    /// Upload file data with optional encryption key
    async fn upload_encrypted(&self, data: &[u8], path: &str, encryption_key: Option<&str>) -> Result<StorageResult> {
        let _ = encryption_key; // Default: ignore key
        self.upload(data, path).await
    }

    /// Read file at path
    async fn read(&self, path: &str) -> Result<Vec<u8>>;

    /// Read file with optional encryption key for decryption
    async fn read_encrypted(&self, path: &str, encryption_key: Option<&str>) -> Result<Vec<u8>> {
        let _ = encryption_key; // Default: ignore key
        self.read(path).await
    }

    /// Get the URL for serving a file
    fn get_url(&self, path: &str) -> String;

    /// Delete a file
    async fn delete(&self, path: &str) -> Result<()>;

    /// Delete multiple files
    async fn delete_many(&self, paths: &[String]) -> Result<()>;

    /// Check if a file exists
    async fn exists(&self, path: &str) -> Result<bool>;

    /// Upload a thumbnail, returns the stored path
    async fn upload_thumbnail(
        &self,
        buffer: &[u8],
        base_path: &str,
        size: ThumbnailSize,
    ) -> Result<String>;

    /// Upload a thumbnail with optional encryption key
    async fn upload_thumbnail_encrypted(
        &self,
        buffer: &[u8],
        base_path: &str,
        size: ThumbnailSize,
        encryption_key: Option<&str>,
    ) -> Result<String> {
        let _ = encryption_key; // Default: ignore key
        self.upload_thumbnail(buffer, base_path, size).await
    }

    /// Get thumbnail URL
    fn get_thumbnail_url(&self, base_path: &str, size: ThumbnailSize) -> String;

    /// Get local file path if available
    fn get_local_path(&self, r#path: &str) -> Option<std::path::PathBuf> {
        None
    }

    /// Get cloud base URL if available
    fn get_cloud_url(&self, r#path: &str) -> Option<String> {
        None
    }
}

/// Create storage provider based on config
pub fn create_provider(
    provider_type: &str,
    upload_dir: &Path,
    cloudstore_url: Option<&str>,
    cloudstore_api_key: Option<&str>,
) -> Box<dyn StorageProvider> {
    match provider_type {
        "cloudstore" => {
            let url = cloudstore_url.expect("CLOUDSTORE_URL required when STORAGE_PROVIDER=cloudstore");
            tracing::info!("Using CloudStore provider at {}", url);
            Box::new(cloudstore::CloudStoreProvider::new(url, cloudstore_api_key))
        }
        _ => {
            tracing::info!("Using local storage provider at {:?}", upload_dir);
            Box::new(local::LocalStorageProvider::new(upload_dir.to_path_buf()))
        }
    }
}
