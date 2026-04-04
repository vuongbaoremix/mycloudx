mod error;
mod metrics;
mod middleware;
mod routes;
mod state;

use axum::routing::{delete, get, head, put};
use axum::{middleware as axum_mw, Router};
use cloudstore_cache::CacheEngine;
use cloudstore_sync::providers::gdrive::GDriveProvider;
use cloudstore_sync::queue::SyncQueue;
use cloudstore_sync::worker::{self, WorkerConfig};
use state::AppState;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tracing::info;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env file (optional, won't fail if missing).
    let _ = dotenvy::dotenv();

    // Install TLS crypto provider (required by rustls).
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls CryptoProvider");

    // Initialize structured logging.
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_env("CLOUDSTORE_LOG_LEVEL")
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_target(true)
        .init();

    info!("Starting CloudStore API server...");

    // Read config from env vars with defaults.
    let host = std::env::var("CLOUDSTORE_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port: u16 = std::env::var("CLOUDSTORE_PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .expect("CLOUDSTORE_PORT must be a valid port number");
    let cache_dir =
        std::env::var("CLOUDSTORE_CACHE_DIR").unwrap_or_else(|_| "/data/cache".to_string());
    let sync_workers: usize = std::env::var("CLOUDSTORE_SYNC_WORKERS")
        .unwrap_or_else(|_| "4".to_string())
        .parse()
        .unwrap_or(4);
    let sync_retry_max: u32 = std::env::var("CLOUDSTORE_SYNC_RETRY_MAX")
        .unwrap_or_else(|_| "5".to_string())
        .parse()
        .unwrap_or(5);
    // Max upload size in bytes (default: 10GB).
    let max_upload_size: usize = std::env::var("CLOUDSTORE_MAX_UPLOAD_SIZE")
        .unwrap_or_else(|_| "10737418240".to_string())
        .parse()
        .unwrap_or(10 * 1024 * 1024 * 1024);

    // Read API key (optional — if not set, auth is disabled).
    let api_key = std::env::var("CLOUDSTORE_API_KEY").ok().filter(|k| !k.is_empty());
    if api_key.is_some() {
        info!("API key authentication enabled");
    } else {
        info!("API key authentication disabled (CLOUDSTORE_API_KEY not set)");
    }

    // Initialize cache engine (scans .meta.json files to rebuild index).
    let cache_max_size: bytesize::ByteSize = std::env::var("CLOUDSTORE_CACHE_MAX_SIZE")
        .unwrap_or_else(|_| "500GB".to_string())
        .parse()
        .expect("CLOUDSTORE_CACHE_MAX_SIZE must be a valid size (e.g. 500GB, 1TB)");

    let cache = CacheEngine::with_max_size(PathBuf::from(&cache_dir), cache_max_size.as_u64()).await?;
    info!(
        cache_dir = %cache_dir,
        max_size = %cache_max_size,
        files = cache.index().len().await,
        "Cache engine initialized with eviction"
    );

    // Initialize cloud provider (optional — may not have token cache yet).
    let gdrive_creds = std::env::var("GDRIVE_CREDENTIALS_PATH").unwrap_or_else(|_| "".to_string());
    let gdrive_folder = std::env::var("GDRIVE_FOLDER_ID").unwrap_or_else(|_| "root".to_string());
    let gdrive_prefix = std::env::var("GDRIVE_PATH_PREFIX").ok().filter(|p| !p.is_empty());
    let provider: Option<Arc<dyn cloudstore_sync::providers::CloudProvider>> =
        match GDriveProvider::new(&gdrive_creds, &gdrive_folder, gdrive_prefix).await {
            Ok(p) => {
                info!("Google Drive provider initialized successfully");
                Some(Arc::new(p))
            }
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    "Google Drive provider not available. Use /api/auth/gdrive/* endpoints to set up OAuth2 token, then restart."
                );
                None
            }
        };

    // Create sync queue and spawn workers (only if provider is available).
    let (sync_queue, sync_receiver) = SyncQueue::new(100_000);
    let metrics = metrics::AppMetrics::new();

    if let Some(ref prov) = provider {
        // Pass sync metrics counters to workers (same Arc shared with AppMetrics).
        let sync_metrics = cloudstore_sync::worker::SyncMetrics::new(
            metrics.sync_success_counter(),
            metrics.sync_failure_counter(),
        );
        let worker_config = WorkerConfig {
            worker_count: sync_workers,
            retry_max: sync_retry_max,
            ..Default::default()
        };
        let _worker_handle = worker::spawn_workers(
            sync_receiver,
            cache.clone(),
            prov.clone(),
            worker_config,
            sync_queue.clone(),
            Some(sync_metrics),
        );

        // Startup recovery: re-enqueue any files that were not yet synced.
        {
            use cloudstore_common::FileStatus;
            use cloudstore_common::PathId;

            let mut recovered = 0u32;
            for (path_id_str, _meta) in cache.index().list_by_status(&FileStatus::Cached).await
                .into_iter()
                .chain(cache.index().list_by_status(&FileStatus::SyncFailed).await)
            {
                if let Ok(path_id) = PathId::parse(&path_id_str) {
                    let job = cloudstore_sync::queue::SyncJob::new(path_id);
                    let _ = sync_queue.enqueue(job).await;
                    recovered += 1;
                }
            }
            if recovered > 0 {
                info!(count = recovered, "Re-enqueued unsynced files from previous session");
            }
        }
    } else {
        info!("Sync workers not started (no cloud provider available)");
        // Drop receiver so it doesn't block
        drop(sync_receiver);
    }

    // Start periodic cache eviction (every 5 minutes).
    let _eviction_handle = cache.start_eviction_task(std::time::Duration::from_secs(300));

    // Build shared state.
    let app_state = AppState {
        cache,
        sync_queue,
        provider,
        api_key,
        metrics,
        active_downloads: Arc::new(tokio::sync::Mutex::new(std::collections::HashSet::new())),
    };

    // Build router.
    // Protected routes (require auth).
    let protected = Router::new()
        // File operations (path-based ID)
        .route(
            "/api/files/{provider}/{*path}",
            put(routes::files::upload_file),
        )
        .route(
            "/api/files/{provider}/{*path}",
            get(routes::files::download_file),
        )
        .route(
            "/api/files/{provider}/{*path}",
            head(routes::files::head_file),
        )
        .route(
            "/api/files/{provider}/{*path}",
            delete(routes::files::delete_file),
        )
        // Listing & status
        .route(
            "/api/list/{provider}/{*path}",
            get(routes::files::list_files),
        )
        .route(
            "/api/status/{provider}/{*path}",
            get(routes::files::file_status),
        )
        .route("/api/stats", get(routes::health::stats))
        .route_layer(axum_mw::from_fn_with_state(
            app_state.clone(),
            middleware::auth::require_auth,
        ));

    // Public routes (no auth).
    let public = Router::new()
        .route("/dashboard", get(routes::dashboard::dashboard))
        .route("/api/health", get(routes::health::health_check))
        .route("/metrics", get(routes::health::prometheus_metrics))
        // GDrive OAuth2 setup — user opens /api/auth/gdrive in browser, everything is automatic.
        .route("/api/auth/gdrive", get(routes::auth::gdrive_auth_redirect))
        .route("/api/auth/gdrive/callback", get(routes::auth::gdrive_auth_callback))
        .route("/api/auth/gdrive/status", get(routes::auth::gdrive_auth_status));

    let app = Router::new()
        .merge(protected)
        .merge(public)
        // Middleware
        .layer(axum::extract::DefaultBodyLimit::max(max_upload_size))
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(tower_http::cors::CorsLayer::permissive())
        // State
        .with_state(app_state);

    // Start server with graceful shutdown.
    let addr: SocketAddr = format!("{}:{}", host, port).parse()?;
    info!(%addr, "CloudStore API server listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("CloudStore API server shut down gracefully");
    Ok(())
}

/// Wait for Ctrl+C or SIGTERM, then initiate graceful shutdown.
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => { tracing::info!("Received Ctrl+C, shutting down..."); },
        _ = terminate => { tracing::info!("Received SIGTERM, shutting down..."); },
    }
}
