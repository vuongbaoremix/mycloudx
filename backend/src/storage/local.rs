use anyhow::Result;
use std::path::{Path, PathBuf};
use tokio::fs;

use super::{StorageProvider, StorageResult, ThumbnailSize};

pub struct LocalStorageProvider {
    base_dir: PathBuf,
}

impl LocalStorageProvider {
    pub fn new(base_dir: PathBuf) -> Self {
        Self { base_dir }
    }

    fn abs_path(&self, relative: &str) -> PathBuf {
        self.base_dir.join(relative)
    }

    async fn ensure_dir(path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        Ok(())
    }
}

#[async_trait::async_trait]
impl StorageProvider for LocalStorageProvider {
    async fn upload(&self, data: &[u8], path: &str) -> Result<StorageResult> {
        let abs = self.abs_path(path);
        Self::ensure_dir(&abs).await?;
        fs::write(&abs, data).await?;

        let size = data.len() as u64;
        Ok(StorageResult {
            path: path.to_string(),
            size,
            url: self.get_url(path),
        })
    }

    async fn read(&self, path: &str) -> Result<Vec<u8>> {
        let abs = self.abs_path(path);
        Ok(fs::read(abs).await?)
    }

    fn get_url(&self, path: &str) -> String {
        format!("/api/media/serve/{}", urlencoding::encode(path))
    }

    async fn delete(&self, path: &str) -> Result<()> {
        let abs = self.abs_path(path);
        if abs.exists() {
            fs::remove_file(abs).await?;
        }
        Ok(())
    }

    async fn delete_many(&self, paths: &[String]) -> Result<()> {
        for path in paths {
            let _ = self.delete(path).await;
        }
        Ok(())
    }

    async fn exists(&self, path: &str) -> Result<bool> {
        let abs = self.abs_path(path);
        Ok(abs.exists())
    }

    async fn upload_thumbnail(
        &self,
        buffer: &[u8],
        base_path: &str,
        size: ThumbnailSize,
    ) -> Result<String> {
        let parts: Vec<&str> = base_path.split('/').collect();
        let filename = parts.last().unwrap_or(&"file");
        let name_no_ext = Path::new(filename)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("file");

        let parent_dir = if parts.len() > 1 {
            parts[..parts.len() - 1].join("/")
        } else {
            "".to_string()
        };

        let thumb_path = if parent_dir.ends_with(name_no_ext) {
            format!("{}/{}.webp", parent_dir, size.as_str())
        } else {
            let user_id = parts.first().unwrap_or(&"unknown");
            format!("{}/.thumbnails/{}/{}.webp", user_id, size.as_str(), name_no_ext)
        };

        let abs = self.abs_path(&thumb_path);
        Self::ensure_dir(&abs).await?;
        fs::write(&abs, buffer).await?;

        Ok(thumb_path)
    }

    fn get_thumbnail_url(&self, base_path: &str, size: ThumbnailSize) -> String {
        let parts: Vec<&str> = base_path.split('/').collect();
        let filename = parts.last().unwrap_or(&"file");
        let name_no_ext = Path::new(filename)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("file");

        let parent_dir = if parts.len() > 1 {
            parts[..parts.len() - 1].join("/")
        } else {
            "".to_string()
        };

        let thumb_path = if parent_dir.ends_with(name_no_ext) {
            format!("{}/{}.webp", parent_dir, size.as_str())
        } else {
            let user_id = parts.first().unwrap_or(&"unknown");
            format!("{}/.thumbnails/{}/{}.webp", user_id, size.as_str(), name_no_ext)
        };
        self.get_url(&thumb_path)
    }

    fn get_local_path(&self, path: &str) -> Option<PathBuf> {
        Some(self.abs_path(path))
    }
}
