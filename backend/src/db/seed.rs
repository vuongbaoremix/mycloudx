use anyhow::Result;

use crate::db::DbPool;
use crate::config::Config;

/// Seed admin user if no users exist.
pub async fn seed_admin(db: &DbPool, config: &Config) -> Result<()> {
    // Check if any users exist
    let count: i64 = sqlx::query_scalar("SELECT count(id) FROM user")
        .fetch_one(db)
        .await?;

    if count > 0 {
        tracing::info!("Users already exist, skipping admin seed");
        return Ok(());
    }

    let password_hash = bcrypt::hash(&config.admin_password, 12)?;
    let admin_id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        r#"
        INSERT INTO user (id, name, email, password_hash, role, storage_used, storage_quota, settings)
        VALUES (?, ?, ?, ?, 'admin', 0.0, 10737418240.0, '{"theme":"system","language":"vi","gallery_columns":4}')
        "#
    )
    .bind(admin_id)
    .bind(&config.admin_name)
    .bind(&config.admin_email)
    .bind(password_hash)
    .execute(db)
    .await?;

    tracing::info!("Admin user seeded: {}", config.admin_email);

    Ok(())
}
