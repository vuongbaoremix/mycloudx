# MyCloud

Personal media management platform — a lightweight clone of [CloudHub](../CloudHub).

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Rust (Axum) |
| Frontend | Vite + React (SPA) |
| Database | SurrealDB Embedded (RocksDB) |
| Image | `image` crate + `blurhash` |
| Auth | JWT (jsonwebtoken) |
| Deploy | Single static binary, `scratch` Docker image |

## Quick Start (Dev)

```bash
# Terminal 1: Start backend
cd backend
cargo run

# Terminal 2: Start frontend dev server (proxied to backend)
cd frontend
bun dev
```

## Docker Deploy

```bash
# Build image
deploy\build-image.bat

# Run
docker compose -f deploy/docker-compose.yml up -d
```

Access: http://localhost:3000
Default admin: `admin@mycloud.local` / `Admin@123456`

## Architecture

Single binary contains:
- Rust API server (Axum)
- SurrealDB embedded (RocksDB storage)
- React SPA (compiled and embedded via `rust-embed`)

```
1 container ← 1 binary ← { backend + frontend + database }
```

## Comparison vs CloudHub

| Metric | CloudHub | MyCloud |
|---|---|---|
| Docker image | ~815MB (3 containers) | ~15-20MB (1 container) |
| RAM | ~512MB+ | ~30-50MB |
| Containers | 3 | 1 |
| Cold start | 5-10s | <1s |
