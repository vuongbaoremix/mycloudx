---
name: SQLite with sqlx
description: Best practices and gotchas for using SQLite with sqlx in this project
---

# SQLite with Sqlx — Rust Integration Patterns

## Connection

This project uses **SQLite** through `sqlx` connection pools:

```rust
use sqlx::sqlite::{SqlitePoolOptions, SqliteConnectOptions};
let db = SqlitePoolOptions::new().connect_with(options).await?;
```
The connection pool is automatically bound to Axum's `AppState` and accessed via `state.db`.

## ⚠️ Critical Gotcha: Compile-Time Macros vs Runtime Execution

`sqlx` provides powerful `query!` and `query_scalar!` macros that perform compile-time schema validation. However, this repository broadly **shuns** compile-time macros to avoid painful `Cargo` environment setups linking to live `.db` files during build time.

### ALWAYS use standard `query` and `query_as` functions

```rust
// ❌ Avoid. Will fail if `DATABASE_URL` isn't perfectly reachable during build.
let count: i64 = sqlx::query_scalar!("SELECT count(id) FROM user").fetch_one(&state.db).await?;

// ✅ Correct. Checked at runtime seamlessly.
let count: i64 = sqlx::query_scalar("SELECT count(id) FROM user").fetch_one(&state.db).await?;
```

```rust
// ❌ Avoid query!
sqlx::query!("INSERT INTO my_table (name) VALUES (?)", payload.name).execute(...).await?;

// ✅ Correct pattern
sqlx::query("INSERT INTO my_table (name) VALUES (?)")
    .bind(&payload.name)
    .execute(&state.db)
    .await?;
```

## Arrays and Nested JSON

Unlike Document databases, SQLite does not cleanly support arrays. We store arrays and complex structures (like `settings` or `thumbnails`) as **stringified JSON text**.

Use `sqlx::types::Json` for automated zero-cost serialization:

```rust
#[derive(sqlx::FromRow)]
pub struct User {
    pub id: String,
    pub settings: sqlx::types::Json<UserSettings>,
}
```
When updating fields, `Bind` works seamlessly over JSON if passing standard Serde values.

## Many-to-Many Relationships

Do NOT store large relational arrays in JSON strings. If relationships are complex (like `album_media`), **create a junction table** (`album_media` with `album_id` and `media_id`). Fetch with standard JOINs.
