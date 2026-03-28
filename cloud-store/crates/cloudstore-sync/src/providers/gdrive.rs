use async_trait::async_trait;
use cloudstore_common::CloudStoreError;
use google_drive3::api::File as DriveFile;
use google_drive3::DriveHub;
use google_drive3::yup_oauth2;
use std::collections::HashMap;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, info};

use super::{CloudProvider, ProviderHealth};

// The correct client type from google-drive3 re-exports.
use google_drive3::hyper_rustls::HttpsConnector;
use google_drive3::hyper_util::client::legacy::connect::HttpConnector;

type GDriveHub = DriveHub<HttpsConnector<HttpConnector>>;

/// Google Drive provider using OAuth2 user consent flow.
/// On first run, opens browser for Google login → token cached to disk.
pub struct GDriveProvider {
    hub: GDriveHub,
    folder_id: String,
    /// Optional path prefix prepended to all remote paths.
    path_prefix: Option<String>,
    /// In-memory cache: "parent_id/folder_name" → folder_id.
    /// Prevents duplicate folder creation from concurrent uploads.
    folder_cache: Arc<Mutex<HashMap<String, String>>>,
}

impl GDriveProvider {
    /// Create a new GDriveProvider with OAuth2 user authentication.
    /// `path_prefix` is an optional prefix for all remote paths (e.g. "backup" → all files go under backup/ folder).
    pub async fn new(
        credentials_path: &str,
        folder_id: &str,
        path_prefix: Option<String>,
    ) -> Result<Self, CloudStoreError> {
        if credentials_path.is_empty() {
            return Err(CloudStoreError::ConfigError(
                "GDRIVE_CREDENTIALS_PATH is empty".into(),
            ));
        }

        let secret = yup_oauth2::read_application_secret(credentials_path)
            .await
            .map_err(|e| {
                CloudStoreError::ConfigError(format!(
                    "Failed to read credentials from '{}': {}", credentials_path, e
                ))
            })?;

        let creds_path = PathBuf::from(credentials_path);
        let token_cache = creds_path
            .parent()
            .unwrap_or(&PathBuf::from("."))
            .join("gdrive_token_cache.json");

        let auth_connector = google_drive3::hyper_rustls::HttpsConnectorBuilder::new()
            .with_webpki_roots()
            .https_only()
            .enable_http2()
            .build();

        let auth_client = google_drive3::hyper_util::client::legacy::Client::builder(
            google_drive3::hyper_util::rt::TokioExecutor::new(),
        )
        .build(auth_connector);

        let auth = yup_oauth2::InstalledFlowAuthenticator::with_client(
            secret,
            yup_oauth2::InstalledFlowReturnMethod::HTTPRedirect,
            yup_oauth2::client::CustomHyperClientBuilder::from(auth_client),
        )
        .persist_tokens_to_disk(token_cache)
        .build()
        .await
        .map_err(|e| {
            CloudStoreError::ConfigError(format!("Failed to build authenticator: {}", e))
        })?;

        let api_connector = google_drive3::hyper_rustls::HttpsConnectorBuilder::new()
            .with_webpki_roots()
            .https_only()
            .enable_http2()
            .build();

        let client = google_drive3::hyper_util::client::legacy::Client::builder(
            google_drive3::hyper_util::rt::TokioExecutor::new(),
        )
        .build(api_connector);

        let hub = DriveHub::new(client, auth);

        info!(folder_id = folder_id, path_prefix = ?path_prefix, "Google Drive provider initialized (OAuth2)");

        Ok(Self {
            hub,
            folder_id: folder_id.to_string(),
            path_prefix,
            folder_cache: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    /// Find or create nested folder structure on Drive.
    /// Holds the folder_cache lock for the entire operation to prevent
    /// concurrent workers from creating duplicate folders.
    async fn ensure_folder_path(
        &self,
        parent_id: &str,
        path_parts: &[&str],
    ) -> Result<String, CloudStoreError> {
        // Hold lock for entire folder resolution — serializes folder creation
        // but file uploads still run in parallel after folders are resolved.
        let mut cache = self.folder_cache.lock().await;
        let mut current_parent = parent_id.to_string();

        for folder_name in path_parts {
            if folder_name.is_empty() {
                continue;
            }

            let cache_key = format!("{}/{}", current_parent, folder_name);

            // Cache hit → skip API call entirely.
            if let Some(cached_id) = cache.get(&cache_key) {
                current_parent = cached_id.clone();
                continue;
            }

            // Cache miss → query Google Drive.
            let query = format!(
                "name = '{}' and '{}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                folder_name, current_parent
            );

            let result = self.hub
                .files()
                .list()
                .q(&query)
                .page_size(1)
                .doit()
                .await
                .map_err(|e| CloudStoreError::ProviderError {
                    provider: "gdrive".into(),
                    message: format!("Search folder failed: {}", e),
                })?;

            let folder_id = if let Some(existing_id) = result.1.files
                .as_ref()
                .and_then(|files| files.first())
                .and_then(|f| f.id.clone())
            {
                existing_id
            } else {
                // Create folder (we're the only one — lock is held).
                let folder_meta = DriveFile {
                    name: Some(folder_name.to_string()),
                    mime_type: Some("application/vnd.google-apps.folder".to_string()),
                    parents: Some(vec![current_parent.clone()]),
                    ..Default::default()
                };

                let (_, created_file) = self.hub
                    .files()
                    .create(folder_meta)
                    .upload(
                        Cursor::new(Vec::<u8>::new()),
                        "application/octet-stream".parse().unwrap(),
                    )
                    .await
                    .map_err(|e| CloudStoreError::ProviderError {
                        provider: "gdrive".into(),
                        message: format!("Create folder '{}' failed: {}", folder_name, e),
                    })?;

                let new_id = created_file.id.ok_or_else(|| CloudStoreError::ProviderError {
                    provider: "gdrive".into(),
                    message: format!("Created folder '{}' but got no ID", folder_name),
                })?;

                debug!(folder = folder_name, id = %new_id, "Created folder on Google Drive");
                new_id
            };

            // Cache and advance.
            cache.insert(cache_key, folder_id.clone());
            current_parent = folder_id;
        }

        Ok(current_parent)
    }
}

#[async_trait]
impl CloudProvider for GDriveProvider {
    fn name(&self) -> &str {
        "gdrive"
    }

    async fn upload(
        &self,
        remote_path: &str,
        local_path: &Path,
        mime_type: &str,
    ) -> Result<String, CloudStoreError> {
        // Prepend path prefix if configured.
        let full_path = match &self.path_prefix {
            Some(prefix) => format!("{}/{}", prefix, remote_path),
            None => remote_path.to_string(),
        };

        let parts: Vec<&str> = full_path.split('/').collect();
        let (folder_parts, filename) = if parts.len() > 1 {
            (&parts[..parts.len() - 1], parts[parts.len() - 1])
        } else {
            (&[][..], parts[0])
        };

        let parent_id = if folder_parts.is_empty() {
            self.folder_id.clone()
        } else {
            self.ensure_folder_path(&self.folder_id, folder_parts).await?
        };

        // Check if file already exists on Drive.
        let query = format!(
            "name = '{}' and '{}' in parents and trashed = false",
            filename, parent_id
        );
        let existing = self.hub
            .files()
            .list()
            .q(&query)
            .page_size(1)
            .doit()
            .await
            .map_err(|e| CloudStoreError::ProviderError {
                provider: "gdrive".into(),
                message: format!("Search file failed: {}", e),
            })?;

        let mime: mime::Mime = mime_type.parse().unwrap_or(mime::APPLICATION_OCTET_STREAM);

        // Open file from disk — streams via tokio::fs, NOT loaded into RAM.
        let file = tokio::fs::File::open(local_path).await.map_err(|e| {
            CloudStoreError::Io(e)
        })?;
        let file_size = file.metadata().await.map(|m| m.len()).unwrap_or(0);

        // If file exists → update in place (preserves file ID, share links, revision history).
        // If file is new → create.
        let existing_id = existing.1.files
            .as_ref()
            .and_then(|files| files.first())
            .and_then(|f| f.id.clone());

        let file_id = if let Some(ref id) = existing_id {
            debug!(file_id = %id, "Updating existing file on Google Drive");
            let update_meta = DriveFile {
                name: Some(filename.to_string()),
                ..Default::default()
            };
            let result = self.hub
                .files()
                .update(update_meta, id)
                .upload_resumable(file.into_std().await, mime)
                .await
                .map_err(|e| CloudStoreError::ProviderError {
                    provider: "gdrive".into(),
                    message: format!("Update failed: {}", e),
                })?;
            result.1.id.unwrap_or_else(|| id.clone())
        } else {
            debug!("Creating new file on Google Drive");
            let file_meta = DriveFile {
                name: Some(filename.to_string()),
                parents: Some(vec![parent_id]),
                ..Default::default()
            };
            let result = self.hub
                .files()
                .create(file_meta)
                .upload_resumable(file.into_std().await, mime)
                .await
                .map_err(|e| CloudStoreError::ProviderError {
                    provider: "gdrive".into(),
                    message: format!("Upload failed: {}", e),
                })?;
            result.1.id.ok_or_else(|| CloudStoreError::ProviderError {
                provider: "gdrive".into(),
                message: "Upload succeeded but no file ID returned".into(),
            })?
        };

        let cloud_url = format!("https://drive.google.com/file/d/{}/view", file_id);

        info!(
            remote_path = remote_path,
            file_id = %file_id,
            size = file_size,
            updated = existing_id.is_some(),
            "File uploaded to Google Drive"
        );

        Ok(cloud_url)
    }

    async fn download(&self, cloud_url: &str) -> Result<Vec<u8>, CloudStoreError> {
        let file_id = if cloud_url.contains("drive.google.com") {
            cloud_url
                .split("/d/")
                .nth(1)
                .and_then(|s| s.split('/').next())
                .unwrap_or(cloud_url)
        } else {
            cloud_url
        };

        let response = self.hub
            .files()
            .get(file_id)
            .param("alt", "media")
            .doit()
            .await
            .map_err(|e| CloudStoreError::ProviderError {
                provider: "gdrive".into(),
                message: format!("Download failed for '{}': {}", file_id, e),
            })?;

        use http_body_util::BodyExt;
        let body_bytes = response
            .0
            .into_body()
            .collect()
            .await
            .map_err(|e| CloudStoreError::ProviderError {
                provider: "gdrive".into(),
                message: format!("Failed to read body: {}", e),
            })?
            .to_bytes()
            .to_vec();

        info!(file_id = file_id, size = body_bytes.len(), "Downloaded from Google Drive");
        Ok(body_bytes)
    }

    async fn delete(&self, cloud_url: &str) -> Result<(), CloudStoreError> {
        let file_id = if cloud_url.contains("drive.google.com") {
            cloud_url
                .split("/d/")
                .nth(1)
                .and_then(|s| s.split('/').next())
                .unwrap_or(cloud_url)
        } else {
            cloud_url
        };

        self.hub.files().delete(file_id).doit().await
            .map_err(|e| CloudStoreError::ProviderError {
                provider: "gdrive".into(),
                message: format!("Delete failed: {}", e),
            })?;

        info!(file_id = file_id, "Deleted from Google Drive");
        Ok(())
    }

    async fn health(&self) -> Result<ProviderHealth, CloudStoreError> {
        let about = self.hub.about().get()
            .param("fields", "storageQuota")
            .doit()
            .await
            .map_err(|e| CloudStoreError::ProviderError {
                provider: "gdrive".into(),
                message: format!("Health check failed: {}", e),
            })?;

        let (used, limit) = about.1.storage_quota
            .map(|q| {
                let used: Option<u64> = q.usage.and_then(|u: i64| u.try_into().ok());
                let limit: Option<u64> = q.limit.and_then(|l: i64| l.try_into().ok());
                (used, limit)
            })
            .unwrap_or((None, None));

        Ok(ProviderHealth {
            available: true,
            storage_used: used,
            storage_limit: limit,
        })
    }
}
