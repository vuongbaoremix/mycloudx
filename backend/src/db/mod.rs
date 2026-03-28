pub mod seed;

use anyhow::Result;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteSynchronous},
    SqlitePool,
};
use std::path::Path;
use std::str::FromStr;

pub type DbPool = SqlitePool;

pub async fn init_db(path: &Path) -> Result<DbPool> {
    // If path is a directory (like ../data/db), append mycloud.db
    let db_path = if path.extension().is_none() {
        path.join("mycloud.db")
    } else {
        path.to_path_buf()
    };

    if let Some(parent) = db_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let db_url = format!("sqlite:{}", db_path.to_string_lossy());

    if !db_path.exists() {
        std::fs::File::create(&db_path)?;
    }

    let options = SqliteConnectOptions::from_str(&db_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(std::time::Duration::from_secs(10))
        .foreign_keys(true);

    let pool = SqlitePool::connect_with(options).await?;

    tracing::info!("SQLite initialized at {:?}", db_path);

    // Run schema migrations
    sqlx::migrate!("./migrations").run(&pool).await?;
    tracing::info!("SQLite schema migrations applied successfully");

    Ok(pool)
}
