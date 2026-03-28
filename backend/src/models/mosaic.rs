use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Mosaic {
    pub id: String,
    pub user_id: String,
    pub year: i32,
    pub month: Option<i32>,
    pub image_path: String,
    pub thumbnail_path: String,
    pub media_count: i32,
    pub grid_size: sqlx::types::Json<MosaicGridSize>,
    pub last_media_date: DateTime<Utc>,
    pub stale: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MosaicGridSize {
    pub cols: i32,
    pub rows: i32,
}
