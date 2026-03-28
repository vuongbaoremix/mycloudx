use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use cloudstore_common::CloudStoreError;
use serde_json::json;

/// Unified API error type that converts CloudStoreError into HTTP responses.
pub struct ApiError(CloudStoreError);

impl From<CloudStoreError> for ApiError {
    fn from(err: CloudStoreError) -> Self {
        Self(err)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match &self.0 {
            CloudStoreError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            CloudStoreError::InvalidPath(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            CloudStoreError::AlreadyExists(msg) => (StatusCode::CONFLICT, msg.clone()),
            CloudStoreError::UploadTooLarge { size, limit } => (
                StatusCode::PAYLOAD_TOO_LARGE,
                format!("File size {} exceeds limit {}", size, limit),
            ),
            CloudStoreError::CacheFull(msg) => (
                StatusCode::INSUFFICIENT_STORAGE,
                msg.clone(),
            ),
            CloudStoreError::Unauthorized(msg) => (
                StatusCode::UNAUTHORIZED,
                msg.clone(),
            ),
            _ => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("{}", self.0),
            ),
        };

        let body = json!({
            "error": message,
            "status": status.as_u16(),
        });

        (status, Json(body)).into_response()
    }
}
