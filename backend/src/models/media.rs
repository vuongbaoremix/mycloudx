use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Media {
    pub id: String,
    pub user_id: String,
    pub filename: String,
    pub original_name: String,
    pub mime_type: String,
    pub size: f64,
    pub file_hash: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub duration: Option<f64>,
    pub aspect_ratio: f64,
    pub thumbnails: sqlx::types::Json<MediaThumbnails>,
    pub storage_path: String,
    pub storage_provider: String,
    pub blur_hash: Option<String>,
    pub metadata: Option<sqlx::types::Json<MediaMetadata>>,
    pub status: String,
    pub is_favorite: bool,
    pub is_encrypted: bool,
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MediaThumbnails {
    pub micro: Option<String>,
    pub small: Option<String>,
    pub medium: Option<String>,
    pub large: Option<String>,
    pub web: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaMetadata {
    pub exif: Option<serde_json::Value>,
    pub location: Option<GeoLocation>,
    pub taken_at: Option<DateTime<Utc>>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub orientation: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoLocation {
    pub lat: Option<f64>,
    pub lng: Option<f64>,
}

/// Response DTO for media listing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaResponse {
    pub id: String,
    pub user_id: String,
    pub filename: String,
    pub original_name: String,
    pub mime_type: String,
    pub size: f64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub duration: Option<f64>,
    pub aspect_ratio: f64,
    pub thumbnails: MediaThumbnails,
    pub storage_path: String,
    pub blur_hash: Option<String>,
    pub metadata: Option<MediaMetadata>,
    pub status: String,
    pub is_favorite: bool,
    pub is_encrypted: bool,
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

impl MediaResponse {
    fn to_serve_url(path: &Option<String>) -> Option<String> {
        path.as_ref().map(|p| format!("/api/media/serve/{}", urlencoding::encode(p)))
    }

    pub fn from_media(media: &Media) -> Self {
        let thumbnails = MediaThumbnails {
            micro: Self::to_serve_url(&media.thumbnails.0.micro),
            small: Self::to_serve_url(&media.thumbnails.0.small),
            medium: Self::to_serve_url(&media.thumbnails.0.medium),
            large: Self::to_serve_url(&media.thumbnails.0.large),
            web: Self::to_serve_url(&media.thumbnails.0.web),
        };

        Self {
            id: media.id.clone(),
            user_id: media.user_id.clone(),
            filename: media.filename.clone(),
            original_name: media.original_name.clone(),
            mime_type: media.mime_type.clone(),
            size: media.size,
            width: media.width,
            height: media.height,
            duration: media.duration,
            aspect_ratio: media.aspect_ratio,
            thumbnails,
            storage_path: media.storage_path.clone(),
            blur_hash: media.blur_hash.clone(),
            metadata: media.metadata.as_ref().map(|m| m.0.clone()),
            status: media.status.clone(),
            is_favorite: media.is_favorite,
            is_encrypted: media.is_encrypted,
            deleted_at: media.deleted_at,
            created_at: media.created_at,
        }
    }
}

/// DTO to deliver a lightweight payload for the map interface.
/// It excludes EXIF data and large thumbnails.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoMediaResponse {
    pub id: String,
    pub original_name: String,
    pub mime_type: String,
    pub size: f64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub thumbnails: GeoThumbnails,
    pub storage_path: String,
    pub aspect_ratio: f64,
    pub is_favorite: bool,
    pub is_encrypted: bool,
    pub created_at: DateTime<Utc>,
    pub metadata: Option<GeoMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoThumbnails {
    pub micro: Option<String>,
    pub small: Option<String>,
    pub medium: Option<String>,
    pub web: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoMetadata {
    pub location: Option<GeoLocation>,
    pub camera_model: Option<String>,
    pub taken_at: Option<DateTime<Utc>>,
}

impl GeoMediaResponse {
    fn to_serve_url(path: &Option<String>) -> Option<String> {
        path.as_ref().map(|p| format!("/api/media/serve/{}", urlencoding::encode(p)))
    }

    pub fn from_media(media: &Media) -> Self {
        let thumbnails = GeoThumbnails {
            micro: Self::to_serve_url(&media.thumbnails.0.micro),
            small: Self::to_serve_url(&media.thumbnails.0.small),
            medium: Self::to_serve_url(&media.thumbnails.0.medium),
            web: Self::to_serve_url(&media.thumbnails.0.web),
        };

        let metadata = media.metadata.as_ref().map(|m| GeoMetadata {
            location: m.0.location.clone(),
            camera_model: m.0.camera_model.clone(),
            taken_at: m.0.taken_at,
        });

        Self {
            id: media.id.clone(),
            original_name: media.original_name.clone(),
            mime_type: media.mime_type.clone(),
            size: media.size,
            width: media.width,
            height: media.height,
            thumbnails,
            storage_path: media.storage_path.clone(),
            aspect_ratio: media.aspect_ratio,
            is_favorite: media.is_favorite,
            is_encrypted: media.is_encrypted,
            created_at: media.created_at,
            metadata,
        }
    }
}
