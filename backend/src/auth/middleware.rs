use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::Response,
};

use super::jwt::{verify_token, Claims};

/// Extract claims from Authorization header or 'token' query parameter. Returns None if no token.
pub fn extract_claims(req: &Request, jwt_secret: &str) -> Option<Claims> {
    // 1. Try Authorization header
    if let Some(auth_header) = req.headers().get("authorization").and_then(|h| h.to_str().ok()) {
        if let Some(token) = auth_header.strip_prefix("Bearer ") {
            if let Ok(claims) = verify_token(token, jwt_secret) {
                return Some(claims);
            }
        }
    }

    // 2. Try 'token' query parameter (used for direct file downloads via <a> tags)
    if let Some(query) = req.uri().query() {
        for pair in query.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                if k == "token" {
                    if let Ok(claims) = verify_token(v, jwt_secret) {
                        return Some(claims);
                    }
                }
            }
        }
    }

    None
}

/// Middleware: requires valid JWT token
pub async fn require_auth(
    axum::extract::State(state): axum::extract::State<crate::AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    match extract_claims(&req, &state.config.jwt_secret) {
        Some(claims) => {
            req.extensions_mut().insert(claims);
            Ok(next.run(req).await)
        }
        None => Err(StatusCode::UNAUTHORIZED),
    }
}

/// Middleware: requires admin role
pub async fn require_admin(
    axum::extract::State(state): axum::extract::State<crate::AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    match extract_claims(&req, &state.config.jwt_secret) {
        Some(claims) if claims.role == "admin" => {
            req.extensions_mut().insert(claims);
            Ok(next.run(req).await)
        }
        _ => Err(StatusCode::FORBIDDEN),
    }
}
