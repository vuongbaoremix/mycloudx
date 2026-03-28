use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::Response,
};

use super::jwt::{verify_token, Claims};

/// Extract claims from Authorization header. Returns None if no token.
pub fn extract_claims(req: &Request, jwt_secret: &str) -> Option<Claims> {
    let auth_header = req.headers().get("authorization")?.to_str().ok()?;
    let token = auth_header.strip_prefix("Bearer ")?;
    verify_token(token, jwt_secret).ok()
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
