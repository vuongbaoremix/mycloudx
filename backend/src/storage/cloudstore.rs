use anyhow::{anyhow, Result};
use std::path::Path;

use super::{StorageProvider, StorageResult, ThumbnailSize};

/// CloudStore storage provider — delegates file storage to a CloudStore service.
/// API: PUT/GET/DELETE /api/files/{provider}/{path}
/// Auth: Bearer token
pub struct CloudStoreProvider {
    client: reqwest::Client,
    base_url: String,
    api_key: Option<String>,
    provider: String, // e.g. "gdrive"
}

impl CloudStoreProvider {
    pub fn new(base_url: &str, api_key: Option<&str>) -> Self {
        let client = reqwest::Client::builder()
            .pool_max_idle_per_host(4)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.map(|s| s.to_string()),
            provider: "gdrive".to_string(),
        }
    }

    fn file_url(&self, path: &str) -> String {
        format!("{}/api/files/{}/{}", self.base_url, self.provider, path)
    }

    fn auth_header(&self) -> Option<(String, String)> {
        self.api_key.as_ref().map(|key| {
            ("Authorization".to_string(), format!("Bearer {}", key))
        })
    }

    fn build_request(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        if let Some((k, v)) = self.auth_header() {
            req.header(&k, &v)
        } else {
            req
        }
    }
}

#[async_trait::async_trait]
impl StorageProvider for CloudStoreProvider {
    async fn upload(&self, data: &[u8], path: &str) -> Result<StorageResult> {
        let url = self.file_url(path);
        let req = self.build_request(
            self.client.put(&url)
                .header("Content-Type", "application/octet-stream")
                .body(data.to_vec()),
        );

        let t_req = std::time::Instant::now();
        let res = req.send().await.map_err(|e| anyhow!("CloudStore upload failed: {}", e))?;
        tracing::info!("CloudStore: reqwest send {} took {:?}", path, t_req.elapsed());

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(anyhow!("CloudStore upload error {}: {}", status, text));
        }

        let body: serde_json::Value = res.json().await?;
        let size = body["size_bytes"].as_u64().unwrap_or(data.len() as u64);

        Ok(StorageResult {
            path: path.to_string(),
            size,
            url: self.get_url(path),
        })
    }

    async fn read(&self, path: &str) -> Result<Vec<u8>> {
        let url = self.file_url(path);
        let req = self.build_request(self.client.get(&url));
        let res = req.send().await.map_err(|e| anyhow!("CloudStore read failed: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(anyhow!("CloudStore read error {}: {}", status, text));
        }

        Ok(res.bytes().await?.to_vec())
    }

    fn get_url(&self, path: &str) -> String {
        // Serve through MyCloud's own media serve endpoint (proxies to CloudStore)
        format!("/api/media/serve/{}", urlencoding::encode(path))
    }

    async fn delete(&self, path: &str) -> Result<()> {
        let url = self.file_url(path);
        let req = self.build_request(self.client.delete(&url));
        let res = req.send().await.map_err(|e| anyhow!("CloudStore delete failed: {}", e))?;

        if !res.status().is_success() && res.status().as_u16() != 404 {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(anyhow!("CloudStore delete error {}: {}", status, text));
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
        let url = self.file_url(path);
        let req = self.build_request(self.client.head(&url));
        let res = req.send().await;
        Ok(res.map(|r| r.status().is_success()).unwrap_or(false))
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

        self.upload(buffer, &thumb_path).await?;
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

    fn get_cloud_url(&self, path: &str) -> Option<String> {
        Some(self.file_url(path))
    }
}
