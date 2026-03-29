use sqlx::SqlitePool;
use std::time::Duration;
use tokio::time::sleep;

#[derive(Debug, sqlx::FromRow)]
pub struct Job {
    pub id: String,
    pub r#type: String,
    pub payload: String,
    pub status: String,
    pub error: Option<String>,
}

pub fn start_worker(pool: SqlitePool) {
    tokio::spawn(async move {
        tracing::info!("Persistent SQLite Job Worker started");
        
        // Optionally enqueue a cleanup job at startup if not exists
        let _ = enqueue_job(&pool, "cleanup_trash", "{}").await;

        loop {
            if let Err(e) = process_next_job(&pool).await {
                tracing::error!("Error processing persistent job: {}", e);
            }
            sleep(Duration::from_secs(10)).await;
        }
    });
}

pub async fn enqueue_job(pool: &SqlitePool, job_type: &str, payload: &str) -> Result<(), anyhow::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO jobs (id, type, payload, status) VALUES (?, ?, ?, 'pending')")
        .bind(id)
        .bind(job_type)
        .bind(payload)
        .execute(pool)
        .await?;
    Ok(())
}

async fn process_next_job(pool: &SqlitePool) -> Result<(), anyhow::Error> {
    let mut tx = pool.begin().await?;
    
    let job = sqlx::query_as::<_, Job>(
        "SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
    )
    .fetch_optional(&mut *tx)
    .await?;

    if let Some(job) = job {
        sqlx::query("UPDATE jobs SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(&job.id)
            .execute(&mut *tx)
            .await?;
        
        tx.commit().await?;

        tracing::info!("Processing job {} of type {}", job.id, job.r#type);
        
        let result = match job.r#type.as_str() {
            "cleanup_trash" => handle_cleanup_trash(pool).await,
            // Add other job types here (e.g. AI analysis, geo tagging)
            _ => Err(anyhow::anyhow!("Unknown job type: {}", job.r#type)),
        };

        match result {
            Ok(_) => {
                sqlx::query("UPDATE jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?")
                    .bind(&job.id)
                    .execute(pool)
                    .await?;
                tracing::info!("Job {} completed successfully", job.id);
            }
            Err(e) => {
                sqlx::query("UPDATE jobs SET status = 'error', error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?")
                    .bind(e.to_string())
                    .bind(&job.id)
                    .execute(pool)
                    .await?;
                tracing::error!("Job {} failed: {}", job.id, e);
            }
        }
    } else {
        tx.rollback().await?;
    }
    
    Ok(())
}

async fn handle_cleanup_trash(pool: &SqlitePool) -> Result<(), anyhow::Error> {
    tracing::info!("Running cleanup_trash job");
    let result = sqlx::query("DELETE FROM media WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')")
        .execute(pool)
        .await?;
    tracing::info!("Cleaned up {} old trash items", result.rows_affected());
    Ok(())
}
