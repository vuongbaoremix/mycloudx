pub mod gdrive;

use async_trait::async_trait;
use cloudstore_common::CloudStoreError;
use std::path::Path;

/// Health/quota information for a cloud provider.
#[derive(Debug, Clone)]
pub struct ProviderHealth {
    pub available: bool,
    pub storage_used: Option<u64>,
    pub storage_limit: Option<u64>,
}

/// Trait that every cloud storage provider must implement.
#[async_trait]
pub trait CloudProvider: Send + Sync {
    /// Provider name (e.g. "gdrive", "s3").
    fn name(&self) -> &str;

    /// Upload file from a local path to cloud. Returns the cloud URL/ID.
    /// Reads directly from disk — does NOT load entire file into RAM.
    async fn upload(
        &self,
        remote_path: &str,
        local_path: &Path,
        mime_type: &str,
    ) -> Result<String, CloudStoreError>;

    /// Proxy a stream from the cloud, passing headers like Range
    async fn proxy_stream(
        &self,
        cloud_url: &str,
        request_headers: &hyper::HeaderMap,
    ) -> Result<hyper::Response<hyper::body::Incoming>, CloudStoreError>;

    /// Delete file from cloud.
    async fn delete(&self, cloud_url: &str) -> Result<(), CloudStoreError>;

    /// Check provider health and quota.
    async fn health(&self) -> Result<ProviderHealth, CloudStoreError>;
}
