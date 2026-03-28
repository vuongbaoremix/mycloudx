---
description: How to modify the database schema
---

## Steps

1. **Create a new migration file** in `backend/migrations/`:
Use the format `YYYYMMDDHHMMSS_description.sql`.
```sql
-- migrations/20260322120000_add_tags_to_media.sql
ALTER TABLE media ADD COLUMN tags TEXT;
```

2. **Update the Rust model** in `backend/src/models/{name}.rs`:
```rust
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MyModel {
    pub id: String,
    pub name: String,
    // Add new fields, wrapping JSON with sqlx::types::Json
    pub tags: Option<sqlx::types::Json<Vec<String>>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}
```

3. **Restart the backend**:
`sqlx::migrate!` runs automatically on application startup, so the new migration will be seamlessly applied.

## Supported Field Types

| SQLite Type | Rust Type |
|-------------|-----------|
| `TEXT`      | `String` |
| `INTEGER`   | `i32` / `i64` |
| `REAL`      | `f64` |
| `INTEGER` (0/1) | `bool` |
| `DATETIME`  | `DateTime<Utc>` |
| `TEXT` (JSON) | `sqlx::types::Json<T>` |

## Important Notes
- Arrays and nested custom objects must be stored as `TEXT` using the JSON driver (`sqlx::types::Json`).
- For many-to-many relationships (e.g. album to media), strongly prefer creating a junction table (e.g., `album_media`) over storing arrays.
