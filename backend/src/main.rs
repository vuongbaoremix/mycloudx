mod auth;
mod config;
mod db;
mod error;
mod imaging;
mod metrics;
mod models;
mod routes;
mod storage;
mod jobs;

use std::future::Future;
use std::sync::Arc;

use axum::{
    Router,
    extract::{DefaultBodyLimit, FromRequestParts, Request},
    http::{self, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{delete, get, post, put},
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use auth::jwt::Claims;
use config::Config;
use db::DbPool;
use storage::StorageProvider;

/// Global application state shared across all handlers
#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
    pub config: Config,
    pub storage: Arc<dyn StorageProvider>,
    pub metrics: metrics::AppMetrics,
    /// Disk-based unbounded job queue for background image/video processing
    pub job_queue: imaging::job_queue::ProcessingQueue,
}

/// Extract Claims from request â€” allows handlers to use `claims: Claims` directly
impl<S> FromRequestParts<S> for Claims
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    fn from_request_parts(
        parts: &mut http::request::Parts,
        _state: &S,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        let claims = parts.extensions.get::<Claims>().cloned();
        async move { claims.ok_or(StatusCode::UNAUTHORIZED) }
    }
}

// Embed the frontend build directory
#[derive(rust_embed::Embed)]
#[folder = "embedded-frontend"]
#[prefix = ""]
struct FrontendAssets;

/// Serve embedded frontend static files, fallback to index.html for SPA routing
async fn serve_frontend(req: Request) -> Response {
    let path = req.uri().path().trim_start_matches('/');

    // Try to serve the exact file
    if let Some(content) = FrontendAssets::get(path) {
        let mime = mime_guess::from_path(path).first_or_octet_stream();
        (
            [(http::header::CONTENT_TYPE, mime.to_string())],
            content.data.to_vec(),
        )
            .into_response()
    } else {
        // Fallback to index.html for SPA client-side routing
        match FrontendAssets::get("index.html") {
            Some(content) => {
                Html(String::from_utf8_lossy(&content.data).to_string()).into_response()
            }
            None => StatusCode::NOT_FOUND.into_response(),
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env file if present
    let _ = dotenvy::dotenv();

    // Track uptime
    routes::health::init_uptime();
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "mycloud=info,tower_http=info".into()),
        )
        .init();

    // Load config
    let config = Config::from_env();
    tracing::info!("Starting MyCloud server on {}:{}", config.host, config.port);

    // Initialize SurrealDB
    let db = db::init_db(&config.db_path).await?;

    // Seed admin user
    db::seed::seed_admin(&db, &config).await?;

    // Initialize storage
    let storage_provider = storage::create_provider(
        &config.storage_provider,
        &config.upload_dir,
        config.cloudstore_url.as_deref(),
        config.cloudstore_api_key.as_deref(),
    );

    // Ensure upload directory exists
    tokio::fs::create_dir_all(&config.upload_dir).await?;

    // Initialize metrics
    let app_metrics = metrics::AppMetrics::new();
    
    // Start persistent SQLite job queue worker
    jobs::start_worker(db.clone());

    // Start background processing workers.
    // Workers are I/O-bound (waiting on CloudStore/Google Drive HTTP uploads),
    // NOT CPU-bound. So we can run many more workers in parallel.
    // Throughput â‰ˆ worker_count / seconds_per_job
    let job_queue = imaging::job_queue::start_workers(
        4,
        db.clone(),
        Arc::from(storage::create_provider(
            &config.storage_provider,
            &config.upload_dir,
            config.cloudstore_url.as_deref(),
            config.cloudstore_api_key.as_deref(),
        )),
        app_metrics.clone(),
    );

    // Ensure temp directory exists
    tokio::fs::create_dir_all(config.upload_dir.join("tmp")).await?;

    let state = AppState {
        db,
        config: config.clone(),
        storage: Arc::from(storage_provider),
        metrics: app_metrics,
        job_queue,
    };

    // Build API routes
    let public_routes = Router::new()
        .route("/auth/login", post(routes::auth::login))
        .route("/auth/register", post(routes::auth::register))
        .route("/health", get(routes::health::health_check))
        .route("/stats", get(routes::health::system_stats))
        .route("/s/{token}", get(routes::share::access_share));

    let public_media_routes = Router::new()
        .route("/media/serve/{*path}", get(routes::media::serve_file));

    let protected_routes = Router::new()
        // Media
        .route("/media", get(routes::media::list_media))
        .route("/media/geo", get(routes::media::get_geo_media))
        .route("/media/timeline", get(routes::mosaic::get_timeline))
        .route("/media/{id}", get(routes::media::get_media))
        .route("/media/{id}", delete(routes::media::delete_media))
        .route("/media/{id}/favorite", put(routes::media::toggle_favorite))
        .route("/media/{id}/restore", post(routes::media::restore_media))
        // Upload
        .route("/upload/session", post(routes::upload::create_session))
        .route("/upload/file", post(routes::upload::upload_file))
        .route("/upload/chunk", post(routes::upload::upload_chunk))
        .route("/upload/complete", post(routes::upload::complete_upload))
        // User
        .route("/user/profile", get(routes::user::get_profile))
        .route("/user/profile", put(routes::user::update_profile))
        .route("/user/password", put(routes::user::change_password))
        // Auth
        .route("/auth/download-token", get(routes::auth::get_download_token))
        // Albums
        .route("/albums", get(routes::album::list_albums))
        .route("/albums", post(routes::album::create_album))
        .route("/albums/{id}", get(routes::album::get_album))
        .route("/albums/{id}", put(routes::album::update_album))
        .route("/albums/{id}", delete(routes::album::delete_album))
        .route(
            "/albums/{id}/media",
            post(routes::album::add_media_to_album),
        )
        .route(
            "/albums/{id}/media",
            delete(routes::album::remove_media_from_album),
        )
        // Admin
        .route("/admin/stats", get(routes::admin::get_stats))
        .route("/admin/dashboard", get(routes::admin::get_dashboard))
        .route("/admin/users", get(routes::admin::list_users))
        .route("/admin/users/{id}", put(routes::admin::update_user))
        .route("/admin/users/{id}", delete(routes::admin::delete_user))
        .route(
            "/admin/users/{id}/reset-password",
            post(routes::admin::reset_user_password),
        )
        // Share
        .route("/share", post(routes::share::create_share))
        .route("/share", get(routes::share::list_shares))
        .route("/share/{id}", delete(routes::share::delete_share))
        // Search
        .route("/search", get(routes::search::search_media))
        // Explorer
        .route("/explorer/memories", get(routes::explorer::get_memories))
        .route("/explorer/screenshots", get(routes::explorer::get_screenshots))
        .route("/explorer/stats", get(routes::explorer::get_stats))
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            auth::middleware::require_auth,
        ));

    let protected_media_routes = Router::new()
        .route("/media/{id}/download", get(routes::media::download_file))
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            auth::middleware::require_auth,
        ));

    let compressed_api = Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .layer(tower_http::compression::CompressionLayer::new());

    let uncompressed_api = Router::new()
        .merge(public_media_routes)
        .merge(protected_media_routes);

    let api_routes = Router::new()
        .merge(compressed_api)
        .merge(uncompressed_api);

    let frontend_dir = std::env::var("FRONTEND_DIR").unwrap_or_default();
    let app = if !frontend_dir.is_empty() && std::path::Path::new(&frontend_dir).exists() {
        tracing::info!("Serving frontend from directory: {}", frontend_dir);
        let frontend_router = Router::new()
            .fallback_service(
                tower_http::services::ServeDir::new(&frontend_dir).not_found_service(
                    tower_http::services::ServeFile::new(format!("{}/index.html", frontend_dir)),
                ),
            )
            .layer(tower_http::compression::CompressionLayer::new());
        Router::new().nest("/api", api_routes).merge(frontend_router)
    } else {
        tracing::info!("Serving embedded frontend");
        let frontend_router = Router::new()
            .fallback(serve_frontend)
            .layer(tower_http::compression::CompressionLayer::new());
        Router::new().nest("/api", api_routes).merge(frontend_router)
    }
    .layer(
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any),
    )
    .layer(DefaultBodyLimit::max(1024 * 1024 * 1024)) // 1 GB body limit
    .layer(TraceLayer::new_for_http())
    .with_state(state);

    // Start server
    let addr = format!("{}:{}", config.host, config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("MyCloud server listening on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}
