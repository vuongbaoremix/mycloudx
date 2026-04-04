use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: String,
    pub name: String,
    pub email: String,
    pub password_hash: String,
    pub role: String,
    pub avatar: Option<String>,
    pub storage_used: f64,
    pub storage_quota: f64,
    pub settings: sqlx::types::Json<UserSettings>,
    pub encrypted_master_key: Option<String>,
    pub encryption_salt: Option<String>,
    pub encryption_enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSettings {
    pub theme: String,
    pub language: String,
    pub gallery_columns: i32,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            language: "vi".into(),
            gallery_columns: 4,
        }
    }
}

/// Response DTO — excludes password_hash
#[derive(Debug, Serialize, Deserialize)]
pub struct UserResponse {
    pub id: String,
    pub name: String,
    pub email: String,
    pub role: String,
    pub avatar: Option<String>,
    pub storage_used: f64,
    pub storage_quota: f64,
    pub settings: UserSettings,
    pub encryption_enabled: bool,
    pub created_at: DateTime<Utc>,
}

impl UserResponse {
    pub fn from_user(user: &User) -> Self {
        Self {
            id: user.id.clone(),
            name: user.name.clone(),
            email: user.email.clone(),
            role: user.role.clone(),
            avatar: user.avatar.clone(),
            storage_used: user.storage_used,
            storage_quota: user.storage_quota,
            settings: user.settings.0.clone(),
            encryption_enabled: user.encryption_enabled,
            created_at: user.created_at,
        }
    }
}
