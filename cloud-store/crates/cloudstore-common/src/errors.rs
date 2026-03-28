use thiserror::Error;

/// Unified error type for CloudStore.
#[derive(Debug, Error)]
pub enum CloudStoreError {
    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("File not found: {0}")]
    NotFound(String),

    #[error("File already exists: {0}")]
    AlreadyExists(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Cache full: {0}")]
    CacheFull(String),

    #[error("Sync error: {0}")]
    SyncError(String),

    #[error("Provider error: {provider} - {message}")]
    ProviderError { provider: String, message: String },

    #[error("Config error: {0}")]
    ConfigError(String),

    #[error("Upload too large: {size} bytes exceeds limit of {limit} bytes")]
    UploadTooLarge { size: u64, limit: u64 },

    #[error("Unauthorized: {0}")]
    Unauthorized(String),
}
