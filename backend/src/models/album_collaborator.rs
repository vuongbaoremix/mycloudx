use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AlbumCollaborator {
    pub album_id: String,
    pub user_id: String,
    pub role: String,
    pub can_download: bool,
    pub invited_by: String,
    pub created_at: DateTime<Utc>,
}
