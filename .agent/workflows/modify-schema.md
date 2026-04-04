---
description: How to modify the database schema
---

## Steps

1. **Create a new migration file** in `backend/migrations/`:
Use the format `YYYYMMDD_description.sql` (shorter date format is fine, must sort correctly).
```sql
-- migrations/20260405_add_tags_to_media.sql
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

3. **Update response DTOs** if the field should be visible to the frontend:
```rust
pub struct MyModelResponse {
    pub tags: Option<Vec<String>>,
}
```

4. **Restart the backend**:
`sqlx::migrate!` runs automatically on application startup, so the new migration will be seamlessly applied.

## Existing Migrations

| File | Purpose |
|------|---------|
| `20260322100000_init.sql` | Core tables: user, media, album, album_media, shared_link, upload_session |
| `20260328100000_create_jobs.sql` | Background jobs queue table |
| `20260330100000_geo_index.sql` | Geo-location JSON index |
| `20260403_encryption_support.sql` | E2EE: encrypted_master_key, encryption_salt, encryption_enabled (user); is_encrypted (media) |

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
- SQLite `ALTER TABLE` only supports `ADD COLUMN`. For more complex changes, create a new table and migrate data.
- New columns should have `DEFAULT` values to avoid breaking existing rows.
