---
description: How to add a new API route to the backend
---

## Steps

1. Create a new route file at `backend/src/routes/{name}.rs`

2. Define your request/response types with `serde::Deserialize`/`Serialize`

3. Implement async handler functions:
```rust
pub async fn my_handler(
    State(state): State<AppState>,
    claims: Claims,  // if auth required
    Json(body): Json<MyRequest>,  // if request body
) -> Result<Json<MyResponse>, StatusCode> {
    // ...
}
```

4. Register the module in `backend/src/routes/mod.rs`:
```rust
pub mod {name};
```

5. Mount the route in `backend/src/main.rs` inside `protected_routes` (or `public_routes` for unauthenticated):
```rust
// Protected (requires JWT):
.route("/my-route", get(routes::{name}::my_handler))

// Public (no auth):
// Add to `public_routes` Router instead
```

6. Add the corresponding frontend API method in `frontend/src/api/client.ts`:
```typescript
async myMethod(param: string) {
  return this.request<ResponseType>(`/my-endpoint/${param}`);
}
```

7. Update `AGENT.md` API endpoints table with the new route

## Database Interaction

Use `sqlx` directly via the connection pool attached to `AppState`. Provide SQL parameters precisely through bindings instead of formatted strings.

```rust
let my_models = sqlx::query_as::<_, MyModel>("SELECT * FROM my_table WHERE user_id = ?")
    .bind(&user_id)
    .fetch_all(&state.db)
    .await?;

// Modifying data (INSERT/UPDATE/DELETE)
sqlx::query("INSERT INTO my_table (name, user_id) VALUES (?, ?)")
    .bind(&payload.name)
    .bind(&user_id)
    .execute(&state.db)
    .await?;
```

## Encryption-Aware Routes

If the route handles file data that may be encrypted:

1. Check `media.is_encrypted` from the DB record
2. Extract the Master Key from JWT claims (`claims.master_key(&state.config.jwt_secret)`) or from `__mc_mk` cookie
3. Derive the DEK: `crate::crypto::derive_dek(&mk, &media.id)`
4. Pass DEK to storage provider's `*_encrypted` methods or inject `X-Encryption-Key` header
