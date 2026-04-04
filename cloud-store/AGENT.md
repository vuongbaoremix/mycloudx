# CloudStore — AI Agent Context

## What Is This?
REST API server in Rust that caches files on NVMe SSD and asynchronously syncs them to Google Drive.
**No database** — filesystem + `.meta.json` sidecar files are the source of truth.

## Architecture Diagram
```
Client ──PUT /api/files/{provider}/{path}──→ [Axum Server]
                                                │
                                    ┌───────────┼───────────┐
                                    ▼           ▼           ▼
                              CacheEngine   SyncQueue   CloudProvider
                                    │           │           │
                                    ▼           ▼           ▼
                             NVMe SSD       mpsc queue   Google Drive
                          (file + .meta.json) ──→ Worker Pool (N workers)
                                                  │
                                                  ▼
                                            Upload to GDrive
                                            (streaming, no RAM)
```

## Crate Map (Dependency Order)

### 1. `cloudstore-common` — Shared types (no dependencies)
| File | Contains |
|------|----------|
| `types.rs` | `PathId` (path-based ID: `{provider}/{path}`), `FileMeta` (sidecar metadata), `FileStatus` (Cached→Syncing→Synced→SyncFailed) |
| `errors.rs` | `CloudStoreError` enum (thiserror): NotFound, InvalidPath, Io, ProviderError, CacheFull, etc. |

### 2. `cloudstore-cache` — NVMe cache engine (depends on: common)
| File | Contains |
|------|----------|
| `engine.rs` | `CacheEngine` — core: `store_stream()` (streaming write + SHA-256), `retrieve()`, `delete()`, `store()` (small files). Atomic meta writes (temp→rename). On startup: scans `.meta.json` files to rebuild in-memory index. |
| `index.rs` | `CacheIndex` — `Arc<RwLock<HashMap<String, FileMeta>>>`. Methods: `upsert`, `get`, `remove`, `list`, `list_by_status`, `total_size_bytes`. |
| `hasher.rs` | SHA-256 hashing: `hash_stream()` (async, 64KB chunks), `hash_bytes()` (sync). |
| `cleaner.rs` | `CacheCleaner` — LRU eviction policy. Only evicts `Synced` files (oldest first). |

### 3. `cloudstore-sync` — Cloud sync layer (depends on: common, cache)
| File | Contains |
|------|----------|
| `providers/mod.rs` | `CloudProvider` trait: `upload(&Path)`, `download()`, `delete()`, `health()`. Also `ProviderHealth` struct. |
| `providers/gdrive.rs` | `GDriveProvider` — OAuth2 via `yup-oauth2`, uses `google-drive3` API. `upload_resumable()` streams from disk. Uses `files().update()` for existing files (preserves ID/permissions). Uses `webpki-roots` (certs bundled in binary). |
| `queue.rs` | `SyncQueue` — `mpsc::Sender<SyncJob>` wrapper. `SyncJob { path_id, retry_count }`. |
| `worker.rs` | `spawn_workers()` — semaphore-bounded pool. Reads file path from cache (zero-copy), uploads via provider. On failure: exponential backoff retry → re-enqueue. |
| `retry.rs` | `backoff_delay()` (2^attempt, capped), `should_retry()`. |

### 4. `cloudstore-api` — HTTP server entry point (depends on: all crates)
| File | Contains |
|------|----------|
| `main.rs` | Tokio + Axum setup. Loads `.env`, inits CacheEngine (with eviction), GDriveProvider, SyncQueue, spawns workers. Graceful shutdown via `tokio::signal`. |
| `state.rs` | `AppState { cache, sync_queue, provider: Option<Arc<dyn CloudProvider>>, api_key, metrics }` — shared via Axum State. Provider is optional to allow server to start before OAuth2 setup. |
| `error.rs` | `ApiError` — converts `CloudStoreError` → HTTP status codes (including 401 Unauthorized). |
| `middleware/auth.rs` | API key auth middleware. Extracts `Authorization: Bearer <key>`. Skips auth if key not configured. |
| `metrics.rs` | `AppMetrics` — lock-free atomic counters. Renders Prometheus exposition format. |
| `routes/files.rs` | `upload_file` (PUT, streaming body→disk), `download_file` (GET, dual-path proxy: if no `Range` → *Tee Stream* (proxies raw to client & background caches to disk), if `Range` → direct proxy & spawns background download into cache). `head_file` (HEAD), `delete_file` (DELETE, also deletes from cloud), `list_files` (GET), `file_status` (GET). |
| `routes/auth.rs` | `gdrive_auth_redirect` (GET → 302 redirect to Google), `gdrive_auth_callback` (GET → exchange code, save token), `gdrive_auth_status` (GET → check token cache). |
| `routes/health.rs` | `health_check` (GET /api/health), `stats` (GET /api/stats with status breakdown). |

## REST API Endpoints
```
PUT    /api/files/{provider}/{*path}    Upload file (streaming body)
GET    /api/files/{provider}/{*path}    Download file
HEAD   /api/files/{provider}/{*path}    File metadata via headers
DELETE /api/files/{provider}/{*path}    Delete file
GET    /api/list/{provider}/{*path}     List files under prefix
GET    /api/status/{provider}/{*path}   Sync status of a file
GET    /api/auth/gdrive                 Start OAuth2 flow (302 redirect)
GET    /api/auth/gdrive/callback        OAuth2 callback (auto-called by Google)
GET    /api/auth/gdrive/status          Check token cache status
GET    /api/health                      Health check
GET    /api/stats                       Cache statistics by status
GET    /metrics                         Prometheus metrics
```

## Data Flow: Upload
1. Client PUTs binary body → `upload_file` handler
2. Body is streamed chunk-by-chunk → `CacheEngine::store_stream()`
3. Each chunk: write to disk + update SHA-256 hasher (RAM = 1 chunk ~64KB)
4. `.meta.json` written atomically (temp → rename)
5. `CacheIndex` updated in-memory
6. `SyncJob` enqueued → `mpsc` channel
7. Worker picks up job → `GDriveProvider::upload()` reads from disk path
8. On success: meta updated to `Synced` + `cloud_url` set
9. On failure: exponential backoff retry (up to `retry_max`)

## Data Flow: Download (Evicted File)
1. Client HTTP GET `download_file` handler.
2. Checks Cache: File not on disk.
3. Checks `AppState::active_downloads` global lock to see if file is currently downloading.
4. **Has Range Header**: Client wants to seek video. Server fires a `CloudProvider::proxy_stream()` directly forwarding the Range to GDrive, achieving $O(1)$ latency. Spawns background task to cache the whole file. 
5. **No Range Header**: Regular playback. Server creates a `Tee Stream` via Tokio channels (`mpsc`). The data comes from `CloudProvider::proxy_stream()` and is duplicated chunk-by-chunk into `axum::body::Body` (client HTTP stream) and `CacheEngine::store_stream()` (disk write) concurrently. This provides instant playback and cache population.

## File Layout on Disk
```
/data/cache/                          ← CLOUDSTORE_CACHE_DIR
  gdrive/                             ← provider prefix
    photos/2026/
      photo.jpg                       ← actual file data
      photo.jpg.meta.json             ← sidecar metadata (FileMeta JSON)
```

## Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `CLOUDSTORE_HOST` | `0.0.0.0` | Bind address |
| `CLOUDSTORE_PORT` | `8080` | HTTP port |
| `CLOUDSTORE_CACHE_DIR` | `/data/cache` | NVMe cache root path |
| `CLOUDSTORE_CACHE_MAX_SIZE` | `500GB` | Max cache size before eviction |
| `CLOUDSTORE_LOG_LEVEL` | `info` | Tracing log level |
| `CLOUDSTORE_SYNC_WORKERS` | `4` | Number of background sync workers |
| `CLOUDSTORE_SYNC_RETRY_MAX` | `5` | Max retry attempts per file |
| `CLOUDSTORE_MAX_UPLOAD_SIZE` | `10GB` | Max single file upload size |
| `CLOUDSTORE_API_KEY` | (none) | API key for auth. If not set, auth is disabled |
| `GDRIVE_CREDENTIALS_PATH` | (required) | Path to Google OAuth2 client_secret.json |
| `GDRIVE_FOLDER_ID` | `root` | Google Drive folder ID for uploads |
| `GDRIVE_PATH_PREFIX` | (none) | Optional prefix for all GDrive paths (e.g. `backup` → `backup/path/file.jpg`) |

## Key Patterns & Conventions
- **All I/O is async** (Tokio). Use `tokio::fs`, never `std::fs`
- **Streaming everywhere** — never buffer entire file in RAM
- **Atomic meta writes** — write to `.tmp` then `rename()`
- **Error handling**: `thiserror` in library crates, `anyhow` in binary
- **All public types** derive `Serialize, Deserialize, Debug, Clone`
- **Config precedence**: env vars override `config/default.toml` defaults
- **TLS**: `hyper-rustls` with `webpki-roots` (CA certs bundled in binary, no system certs needed)
- **Path validation**: `PathId` rejects traversal (`..`), null bytes, component > 255 bytes
- **Auth**: API key via `Authorization: Bearer <key>` header. If `CLOUDSTORE_API_KEY` not set, all requests pass through
- **Encryption**: SSE-C (Server-Side Encryption with Customer Key). Cho phép mã hoá upload và giải mã download on-the-fly sử dụng ciphers dòng ChaCha20 với hỗ trợ O(1) seek `Range`. Key được cung cấp qua `X-Encryption-Key` HTTP header.
- **Cache eviction**: LRU eviction of `Synced` files when cache exceeds `CLOUDSTORE_CACHE_MAX_SIZE`. Only data files deleted, `.meta.json` preserved
- **GDrive overwrite**: Uses `files().update()` to preserve file ID, share links, and revision history
- **Startup recovery**: On boot, re-enqueues files with status `Cached` or `SyncFailed` for sync retry
- **Graceful shutdown**: `tokio::signal` catches Ctrl+C (Windows/Linux) and SIGTERM (Linux/Docker). Axum finishes in-flight requests before exit
- **Metrics**: Lock-free atomic counters at `/metrics` (Prometheus format). Tracks uploads, downloads (cache/cloud), deletes, bytes transferred

## Build & Deploy
```powershell
# Dev (Windows)
cargo run --bin cloudstore-api

# Cross-compile for Linux (requires Docker Desktop)
.\build.bat                          # Uses `cross` → musl static binary → Docker image

# Tests
cargo test --workspace
```

### Docker
- **Dockerfile**: `FROM scratch` (0MB base). Binary is pre-compiled via `build.bat`
- **docker-compose.yml**: Mounts NVMe cache dir, loads `.env`, exposes port 8080
- Binary is fully static (musl), ~10-15MB
- Release profile: `opt-level="z"`, `lto=true`, `strip=true`, `panic="abort"`

## TODO / Incomplete Features
- **S3 provider**: Config stub exists in comments, but not implemented
