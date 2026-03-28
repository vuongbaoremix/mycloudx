use axum::extract::Query;
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Redirect, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;
use std::path::PathBuf;
use tracing::{error, info};

/// GET /api/auth/gdrive — Redirect to Google OAuth2 consent screen.
/// User just opens this URL in browser → auto-redirect to Google → login → callback.
pub async fn gdrive_auth_redirect() -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    let creds_path = std::env::var("GDRIVE_CREDENTIALS_PATH").unwrap_or_default();
    if creds_path.is_empty() {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "GDRIVE_CREDENTIALS_PATH not configured" })),
        ));
    }

    let secret = read_client_secret(&creds_path).await.map_err(|e| {
        error!(error = %e, "Failed to read client_secret.json");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Failed to read credentials: {}", e) })),
        )
    })?;

    // Build callback URL: same host the user is accessing.
    let port: u16 = std::env::var("CLOUDSTORE_PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .unwrap_or(8080);

    let callback_url = format!("http://localhost:{}/api/auth/gdrive/callback", port);

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/auth\
         ?client_id={}\
         &redirect_uri={}\
         &response_type=code\
         &scope=https://www.googleapis.com/auth/drive\
         &access_type=offline\
         &prompt=consent",
        urlencoding::encode(&secret.client_id),
        urlencoding::encode(&callback_url),
    );

    Ok(Redirect::temporary(&auth_url).into_response())
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub error: Option<String>,
}

/// GET /api/auth/gdrive/callback?code=... — Google redirects here after user authorizes.
/// Automatically exchanges code for tokens and saves token cache file.
pub async fn gdrive_auth_callback(
    Query(query): Query<CallbackQuery>,
) -> Result<Html<String>, (StatusCode, Html<String>)> {
    // Handle error from Google (user denied access, etc.)
    if let Some(error) = query.error {
        return Err((
            StatusCode::BAD_REQUEST,
            Html(format!(
                "<html><body><h1>❌ Authorization Failed</h1><p>{}</p>\
                 <p><a href=\"/api/auth/gdrive\">Try again</a></p></body></html>",
                error
            )),
        ));
    }

    let code = query.code.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Html("<html><body><h1>❌ Missing authorization code</h1>\
                  <p><a href=\"/api/auth/gdrive\">Try again</a></p></body></html>".to_string()),
        )
    })?;

    let creds_path = std::env::var("GDRIVE_CREDENTIALS_PATH").unwrap_or_default();
    let secret = read_client_secret(&creds_path).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Html(format!("<html><body><h1>❌ Error</h1><p>{}</p></body></html>", e)),
        )
    })?;

    let port: u16 = std::env::var("CLOUDSTORE_PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .unwrap_or(8080);
    let callback_url = format!("http://localhost:{}/api/auth/gdrive/callback", port);

    // Exchange authorization code for tokens.
    let token_response = exchange_code(
        &secret.token_uri,
        &code,
        &secret.client_id,
        &secret.client_secret,
        &callback_url,
    )
    .await
    .map_err(|e| {
        error!(error = %e, "Token exchange failed");
        (
            StatusCode::BAD_REQUEST,
            Html(format!(
                "<html><body><h1>❌ Token Exchange Failed</h1><p>{}</p>\
                 <p><a href=\"/api/auth/gdrive\">Try again</a></p></body></html>",
                e
            )),
        )
    })?;

    // Build yup_oauth2-compatible token cache format.
    use chrono::{Datelike, Timelike};
    let now = chrono::Utc::now();
    let expires_at = now + chrono::Duration::seconds(token_response.expires_in as i64);

    let token_cache = json!([{
        "scopes": ["https://www.googleapis.com/auth/drive"],
        "token": {
            "access_token": token_response.access_token,
            "refresh_token": token_response.refresh_token,
            "expires_at": [
                expires_at.year(),
                expires_at.ordinal(),
                expires_at.hour(),
                expires_at.minute(),
                expires_at.second(),
                expires_at.timestamp_subsec_nanos(),
                0, 0, 0
            ],
            "id_token": null
        }
    }]);

    // Write token cache file.
    let token_path = token_cache_path(&creds_path);
    let token_json = serde_json::to_string_pretty(&token_cache).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Html(format!("<html><body><h1>❌ Error</h1><p>{}</p></body></html>", e)),
        )
    })?;

    tokio::fs::write(&token_path, &token_json).await.map_err(|e| {
        error!(error = %e, path = %token_path.display(), "Failed to write token cache");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Html(format!("<html><body><h1>❌ Error</h1><p>Failed to write token: {}</p></body></html>", e)),
        )
    })?;

    info!(path = %token_path.display(), "GDrive token cache created successfully");

    Ok(Html(format!(
        "<html><body>\
         <h1>✅ Google Drive Authorization Successful!</h1>\
         <p>Token saved to: <code>{}</code></p>\
         <p>Restart the server to activate Google Drive sync.</p>\
         </body></html>",
        token_path.display()
    )))
}

/// GET /api/auth/gdrive/status — Check token cache status.
pub async fn gdrive_auth_status() -> impl IntoResponse {
    let creds_path = std::env::var("GDRIVE_CREDENTIALS_PATH").unwrap_or_default();
    let token_path = token_cache_path(&creds_path);
    let exists = token_path.exists();

    Json(json!({
        "token_cache_exists": exists,
        "token_cache_path": token_path.display().to_string(),
        "credentials_configured": !creds_path.is_empty(),
    }))
}

// ─── Internal helpers ───────────────────────────────────────────────────────

fn token_cache_path(credentials_path: &str) -> PathBuf {
    let creds = PathBuf::from(credentials_path);
    creds
        .parent()
        .unwrap_or(&PathBuf::from("."))
        .join("gdrive_token_cache.json")
}

#[derive(Deserialize)]
struct ClientSecret {
    client_id: String,
    client_secret: String,
    token_uri: String,
}

#[derive(Deserialize)]
struct ClientSecretFile {
    installed: ClientSecret,
}

async fn read_client_secret(path: &str) -> Result<ClientSecret, String> {
    let data = tokio::fs::read_to_string(path)
        .await
        .map_err(|e| format!("Cannot read '{}': {}", path, e))?;
    let file: ClientSecretFile =
        serde_json::from_str(&data).map_err(|e| format!("Invalid JSON in '{}': {}", path, e))?;
    Ok(file.installed)
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
}

async fn exchange_code(
    token_uri: &str,
    code: &str,
    client_id: &str,
    client_secret: &str,
    redirect_uri: &str,
) -> Result<TokenResponse, String> {
    let form_body = format!(
        "code={}&client_id={}&client_secret={}&redirect_uri={}&grant_type=authorization_code",
        urlencoding::encode(code),
        urlencoding::encode(client_id),
        urlencoding::encode(client_secret),
        urlencoding::encode(redirect_uri),
    );

    let connector = hyper_rustls::HttpsConnectorBuilder::new()
        .with_webpki_roots()
        .https_only()
        .enable_http2()
        .build();

    let client = hyper_util::client::legacy::Client::builder(
        hyper_util::rt::TokioExecutor::new(),
    )
    .build(connector);

    let request = hyper::Request::builder()
        .method(hyper::Method::POST)
        .uri(token_uri)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(http_body_util::Full::new(bytes::Bytes::from(form_body)))
        .map_err(|e| format!("Failed to build request: {}", e))?;

    let response = client
        .request(request)
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    let body_bytes = http_body_util::BodyExt::collect(response.into_body())
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?
        .to_bytes();

    if !status.is_success() {
        let body_str = String::from_utf8_lossy(&body_bytes);
        return Err(format!("Google returned {}: {}", status, body_str));
    }

    serde_json::from_slice(&body_bytes)
        .map_err(|e| format!("Failed to parse token response: {}", e))
}
