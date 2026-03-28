use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub db_path: PathBuf,
    pub upload_dir: PathBuf,
    pub jwt_secret: String,
    pub admin_email: String,
    pub admin_password: String,
    pub admin_name: String,
    pub max_concurrent_uploads: usize,
    pub storage_provider: String,
    pub cloudstore_url: Option<String>,
    pub cloudstore_api_key: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            port: std::env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3000),
            db_path: PathBuf::from(std::env::var("DB_PATH").unwrap_or_else(|_| "./data/db".into())),
            upload_dir: PathBuf::from(
                std::env::var("UPLOAD_DIR").unwrap_or_else(|_| "./data/uploads".into()),
            ),
            jwt_secret: std::env::var("JWT_SECRET")
                .unwrap_or_else(|_| "mycloud-dev-secret-change-in-production".into()),
            admin_email: std::env::var("ADMIN_EMAIL")
                .unwrap_or_else(|_| "admin@mycloud.local".into()),
            admin_password: std::env::var("ADMIN_PASSWORD")
                .unwrap_or_else(|_| "Admin@123456".into()),
            admin_name: std::env::var("ADMIN_NAME").unwrap_or_else(|_| "Administrator".into()),
            max_concurrent_uploads: std::env::var("MAX_CONCURRENT_UPLOADS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(6),
            storage_provider: std::env::var("STORAGE_PROVIDER").unwrap_or_else(|_| "local".into()),
            cloudstore_url: std::env::var("CLOUDSTORE_URL").ok(),
            cloudstore_api_key: std::env::var("CLOUDSTORE_API_KEY").ok(),
        }
    }
}
