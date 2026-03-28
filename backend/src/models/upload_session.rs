use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct UploadSession {
    pub id: String,
    pub user_id: String,
    pub total_files: i32,
    pub completed_files: i32,
    pub failed_files: i32,
    pub status: String,
    pub files: sqlx::types::Json<Vec<UploadSessionFile>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadSessionFile {
    pub original_name: String,
    pub size: f64,
    pub status: String,
    pub error: Option<String>,
    pub media_id: Option<String>,
}
