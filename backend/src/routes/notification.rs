use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use crate::auth::jwt::Claims;
use crate::models::notification::Notification;
use crate::AppState;

pub async fn list_notifications(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<Notification>>, StatusCode> {
    let notifications = sqlx::query_as::<_, Notification>(
        "SELECT * FROM notification WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
    )
    .bind(&claims.sub)
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(notifications))
}

pub async fn mark_all_notifications_read(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<StatusCode, StatusCode> {
    sqlx::query("UPDATE notification SET is_read = 1 WHERE user_id = ? AND is_read = 0")
        .bind(&claims.sub)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}

pub async fn mark_notification_read(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    sqlx::query("UPDATE notification SET is_read = 1 WHERE user_id = ? AND id = ?")
        .bind(&claims.sub)
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}
