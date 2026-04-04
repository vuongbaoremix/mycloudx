use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Notification {
    pub id: String,
    pub user_id: String,
    pub r#type: String, // Use r#type because type is a reserved keyword
    pub title: String,
    pub message: String,
    pub related_id: Option<String>,
    pub is_read: bool,
    pub created_at: DateTime<Utc>,
}
