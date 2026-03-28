use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SharedLink {
    pub id: String,
    pub user_id: String,
    pub token: String,
    pub share_type: String,
    pub media_ids: sqlx::types::Json<Vec<String>>,
    pub album_id: Option<String>,
    pub password_hash: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub view_count: i32,
    pub max_views: Option<i32>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
