use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use crate::state::AppState;

/// Auth middleware: validates `Authorization: Bearer <key>` header.
/// If `AppState.api_key` is None, auth is disabled (all requests pass).
pub async fn require_auth(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let api_key = match &state.api_key {
        Some(key) => key,
        None => return next.run(req).await, // Auth disabled.
    };

    // Extract Bearer token from Authorization header.
    let auth_header = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    match auth_header {
        Some(header) if header.starts_with("Bearer ") => {
            let token = &header[7..];
            if token == api_key {
                next.run(req).await
            } else {
                unauthorized("Invalid API key")
            }
        }
        Some(_) => unauthorized("Authorization header must use Bearer scheme"),
        None => unauthorized("Missing Authorization header"),
    }
}

fn unauthorized(msg: &str) -> Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(json!({
            "error": msg,
            "status": 401,
        })),
    )
        .into_response()
}
