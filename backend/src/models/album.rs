use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Album {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub description: Option<String>,
    pub cover_media_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Junction table row: album ↔ media (many-to-many)
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AlbumMedia {
    pub album_id: String,
    pub media_id: String,
    pub added_at: DateTime<Utc>,
}
