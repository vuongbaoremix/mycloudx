# CloudStore API Documentation

> **Base URL**: `http://{host}:{port}` (default: `http://localhost:8080`)

## Features

### Architecture
- **Rust + Tokio + Axum** — async REST API server, high performance, low memory footprint
- **No database** — filesystem + `.meta.json` sidecar files as source of truth
- **Modular crate design** — 4 crates: `common`, `cache`, `sync`, `api`

### Streaming I/O
- **Zero-buffer upload** — file body streamed chunk-by-chunk to NVMe SSD, chỉ ~64KB RAM bất kể file size
- **Zero-buffer cloud sync** — upload lên Google Drive trực tiếp từ disk path, không load vào RAM
- **SHA-256 hash** — tính hash đồng thời khi ghi file, không cần đọc lại

### Cloud Sync
- **Async background sync** — file được queue và upload lên cloud bởi worker pool (configurable)
- **Google Drive provider** — OAuth2, resumable upload, streaming từ disk
- **Smart overwrite** — dùng `files().update()` API giữ nguyên file ID, share links, revision history (không delete+create)
- **Retry with backoff** — exponential backoff (2^n giây, max 120s), tự động retry khi upload thất bại
- **Startup recovery** — khi restart server, tự re-enqueue file `Cached`/`SyncFailed` chưa sync xong

### Cache Management
- **NVMe SSD cache** — local cache tốc độ cao làm tầng trung gian
- **LRU eviction** — tự động xoá data file `Synced` (cũ nhất trước) khi cache vượt max size, giữ `.meta.json`
- **Cloud recovery** — file bị evict → download tự động từ cloud khi client request, re-cache rồi trả về
- **In-memory index** — rebuild từ `.meta.json` khi startup, O(1) lookup

### Security
- **API Key authentication** — `Authorization: Bearer <key>`, bảo vệ tất cả endpoints trừ health/metrics
- **Optional auth** — nếu không set `CLOUDSTORE_API_KEY`, auth bị disable (backwards compatible)
- **Path validation** — chặn path traversal (`..`), null bytes, component > 255 bytes
- **CORS** — permissive CORS cho cross-origin access

### Monitoring & Operations
- **Prometheus metrics** — `/metrics` endpoint với atomic counters: uploads, downloads, deletes, bytes transferred
- **Health check** — `/api/health` public endpoint cho load balancer / k8s probe
- **Cache statistics** — `/api/stats` breakdown by sync status
- **Structured logging** — `tracing` với env-configurable log level
- **Graceful shutdown** — Ctrl+C (Windows) + SIGTERM (Docker/Linux), hoàn tất in-flight requests trước khi tắt

### Deployment
- **Docker optimized** — `FROM scratch`, static musl binary ~10-15MB, không cần runtime
- **docker-compose ready** — mount cache dir, load `.env`, expose port
- **Cross-platform** — chạy native trên Windows (dev) và Linux (production)
- **TLS built-in** — `webpki-roots` (CA certs bundled trong binary, không cần `ca-certificates` package)

---

## Authentication

If `CLOUDSTORE_API_KEY` is configured, all protected endpoints require:

```
Authorization: Bearer <api-key>
```

**Public endpoints** (no auth required): `GET /api/health`, `GET /metrics`, `GET /api/auth/gdrive/*`

### Error Response (401)
```json
{
  "error": "Missing Authorization header",
  "status": 401
}
```

---

## GDrive OAuth2 Setup

> **No authentication required.** These endpoints are public to enable first-time setup.

### Start Authorization

```
GET /api/auth/gdrive
```

Opens in browser → **302 redirect** to Google OAuth2 consent screen. After user authorizes, Google redirects back to the callback endpoint automatically.

**Example**: Open `http://localhost:8080/api/auth/gdrive` in your browser.

---

### Authorization Callback

```
GET /api/auth/gdrive/callback?code={code}
```

> Called automatically by Google redirect. Do not call manually.

Exchanges the authorization code for tokens and saves to `gdrive_token_cache.json`. Returns HTML success/error page.

---

### Authorization Status

```
GET /api/auth/gdrive/status
```

**Response** `200 OK`:
```json
{
  "token_cache_exists": false,
  "token_cache_path": "./secret/gdrive_token_cache.json",
  "credentials_configured": true
}
```

---
## Endpoints

### Upload File

```
PUT /api/files/{provider}/{path}
```

Upload a file using streaming binary body. File is cached locally and queued for async cloud sync.

| Parameter | Location | Required | Description |
|-----------|----------|----------|-------------|
| `provider` | path | yes | Cloud provider name (e.g. `gdrive`) |
| `path` | path | yes | Remote file path (e.g. `photos/2026/photo.jpg`) |

**Request Body**: Raw binary file content (`application/octet-stream`)

**Response** `200 OK`:
```json
{
  "path_id": "gdrive/photos/2026/photo.jpg",
  "original_name": "photo.jpg",
  "content_hash": "a1b2c3d4e5f6...",
  "size_bytes": 1048576,
  "mime_type": "image/jpeg",
  "status": "cached",
  "created_at": "2026-03-18T15:00:00.000Z"
}
```

**Example**:
```bash
curl -X PUT \
  -H "Authorization: Bearer my-api-key" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @photo.jpg \
  http://localhost:8080/api/files/gdrive/photos/2026/photo.jpg
```

---

### Download File

```
GET /api/files/{provider}/{path}
```

Download a file. Serves from local cache if available; if evicted, transparently fetches from cloud, re-caches, and streams back.

**Response** `200 OK`:
- **Body**: Raw binary file content
- **Headers**:
  - `Content-Type`: MIME type of the file
  - `Content-Disposition`: `attachment; filename="photo.jpg"`
  - `Content-Length`: File size in bytes

**Example**:
```bash
curl -H "Authorization: Bearer my-api-key" \
  -o photo.jpg \
  http://localhost:8080/api/files/gdrive/photos/2026/photo.jpg
```

---

### File Metadata (HEAD)

```
HEAD /api/files/{provider}/{path}
```

Get file metadata without downloading the content.

**Response** `200 OK` (headers only):

| Header | Description |
|--------|-------------|
| `Content-Type` | MIME type |
| `Content-Length` | File size in bytes |
| `X-CloudStore-Status` | Sync status: `cached`, `syncing`, `synced`, `sync_failed` |
| `X-CloudStore-Hash` | SHA-256 content hash |
| `X-CloudStore-Cloud-URL` | Google Drive URL (if synced) |

**Example**:
```bash
curl -I -H "Authorization: Bearer my-api-key" \
  http://localhost:8080/api/files/gdrive/photos/2026/photo.jpg
```

---

### Delete File

```
DELETE /api/files/{provider}/{path}
```

Delete a file from both local cache and cloud storage.

**Response** `200 OK`:
```json
{
  "deleted": "gdrive/photos/2026/photo.jpg"
}
```

**Example**:
```bash
curl -X DELETE -H "Authorization: Bearer my-api-key" \
  http://localhost:8080/api/files/gdrive/photos/2026/photo.jpg
```

---

### List Files

```
GET /api/list/{provider}/{path}
```

List all files under a provider/path prefix.

| Parameter | Location | Required | Description |
|-----------|----------|----------|-------------|
| `provider` | path | yes | Cloud provider name |
| `path` | path | yes | Path prefix to list (e.g. `photos/2026`) |

**Response** `200 OK`:
```json
{
  "provider": "gdrive",
  "count": 2,
  "files": [
    {
      "path_id": "gdrive/photos/2026/photo1.jpg",
      "original_name": "photo1.jpg",
      "size_bytes": 1048576,
      "mime_type": "image/jpeg",
      "status": "synced",
      "created_at": "2026-03-18T15:00:00.000Z"
    },
    {
      "path_id": "gdrive/photos/2026/photo2.jpg",
      "original_name": "photo2.jpg",
      "size_bytes": 2097152,
      "mime_type": "image/jpeg",
      "status": "cached",
      "created_at": "2026-03-18T15:05:00.000Z"
    }
  ]
}
```

---

### File Sync Status

```
GET /api/status/{provider}/{path}
```

Get the sync status of a specific file.

**Response** `200 OK`:
```json
{
  "path_id": "gdrive/photos/2026/photo.jpg",
  "status": "synced",
  "cloud_url": "https://drive.google.com/file/d/abc123/view",
  "synced_at": "2026-03-18T15:01:00.000Z",
  "retry_count": 0,
  "on_disk": true
}
```

**Status values**:

| Status | Description |
|--------|-------------|
| `cached` | Stored locally, not yet synced to cloud |
| `syncing` | Currently being uploaded to cloud |
| `synced` | Successfully synced to cloud |
| `sync_failed` | Sync failed after max retries |

---

### Health Check

```
GET /api/health
```

> **No authentication required.**

**Response** `200 OK`:
```json
{
  "status": "healthy",
  "total_files": 42,
  "total_size_bytes": 1073741824,
  "timestamp": "2026-03-18T15:00:00.000Z"
}
```

---

### Cache Statistics

```
GET /api/stats
```

**Response** `200 OK`:
```json
{
  "total_files": 42,
  "total_size_bytes": 1073741824,
  "by_status": {
    "cached": 5,
    "syncing": 1,
    "synced": 35,
    "sync_failed": 1
  },
  "timestamp": "2026-03-18T15:00:00.000Z"
}
```

---

### Prometheus Metrics

```
GET /metrics
```

> **No authentication required.**

Returns metrics in Prometheus exposition text format.

**Response** `200 OK` (`text/plain`):
```
# HELP cloudstore_uploads_total Total file uploads.
# TYPE cloudstore_uploads_total counter
cloudstore_uploads_total 150
# HELP cloudstore_downloads_cache_total Downloads served from cache.
# TYPE cloudstore_downloads_cache_total counter
cloudstore_downloads_cache_total 320
# HELP cloudstore_downloads_cloud_total Downloads fetched from cloud.
# TYPE cloudstore_downloads_cloud_total counter
cloudstore_downloads_cloud_total 12
# HELP cloudstore_deletes_total Total file deletes.
# TYPE cloudstore_deletes_total counter
cloudstore_deletes_total 8
# HELP cloudstore_bytes_uploaded_total Total bytes uploaded.
# TYPE cloudstore_bytes_uploaded_total counter
cloudstore_bytes_uploaded_total 53687091200
# HELP cloudstore_bytes_downloaded_total Total bytes downloaded.
# TYPE cloudstore_bytes_downloaded_total counter
cloudstore_bytes_downloaded_total 107374182400
```

---

## Error Responses

All errors return JSON with consistent format:

```json
{
  "error": "Human-readable error message",
  "status": 404
}
```

| HTTP Code | Meaning |
|-----------|---------|
| `400` | Invalid path (traversal, empty, null bytes) |
| `401` | Missing or invalid API key |
| `404` | File not found |
| `409` | File already exists |
| `413` | File exceeds `CLOUDSTORE_MAX_UPLOAD_SIZE` |
| `500` | Internal server error |
| `507` | Cache full |

---

## Integration Examples

### Python
```python
import requests

BASE = "http://localhost:8080"
HEADERS = {"Authorization": "Bearer my-api-key"}

# Upload
with open("photo.jpg", "rb") as f:
    r = requests.put(f"{BASE}/api/files/gdrive/photos/photo.jpg",
                     headers=HEADERS, data=f)
    print(r.json())

# Download
r = requests.get(f"{BASE}/api/files/gdrive/photos/photo.jpg",
                 headers=HEADERS)
with open("downloaded.jpg", "wb") as f:
    f.write(r.content)

# List
r = requests.get(f"{BASE}/api/list/gdrive/photos", headers=HEADERS)
print(r.json()["files"])

# Check status
r = requests.get(f"{BASE}/api/status/gdrive/photos/photo.jpg",
                 headers=HEADERS)
print(r.json()["status"])  # "synced"

# Delete
r = requests.delete(f"{BASE}/api/files/gdrive/photos/photo.jpg",
                     headers=HEADERS)
```

### JavaScript (Node.js)
```javascript
const BASE = "http://localhost:8080";
const headers = { Authorization: "Bearer my-api-key" };

// Upload
const fs = require("fs");
const file = fs.readFileSync("photo.jpg");
const res = await fetch(`${BASE}/api/files/gdrive/photos/photo.jpg`, {
  method: "PUT", headers, body: file,
});
console.log(await res.json());

// Download
const dl = await fetch(`${BASE}/api/files/gdrive/photos/photo.jpg`, { headers });
fs.writeFileSync("downloaded.jpg", Buffer.from(await dl.arrayBuffer()));
```

---

## Limits & Configuration

| Setting | Default | Env Variable |
|---------|---------|-------------|
| Max upload size | 10 GB | `CLOUDSTORE_MAX_UPLOAD_SIZE` |
| Max cache size | 500 GB | `CLOUDSTORE_CACHE_MAX_SIZE` |
| Sync workers | 4 | `CLOUDSTORE_SYNC_WORKERS` |
| Max retries | 5 | `CLOUDSTORE_SYNC_RETRY_MAX` |
| GDrive path prefix | (none) | `GDRIVE_PATH_PREFIX` |

## Notes

- **Streaming**: Upload/download operations are fully streamed — constant ~64KB RAM regardless of file size.
- **Async Sync**: After upload, files are queued for cloud sync in the background. Use `GET /api/status` to poll sync progress.
- **Path Format**: `{provider}/{path}` — e.g. `gdrive/documents/report.pdf`. No leading slash needed.
- **Path Prefix**: If `GDRIVE_PATH_PREFIX=backup` is set, all GDrive paths get prefixed: `photos/photo.jpg` → `backup/photos/photo.jpg` on Google Drive.
- **Path Restrictions**: No `..` traversal, no null bytes, path components max 255 bytes.
- **Cloud Recovery**: If a file is evicted from cache but exists on cloud (`synced`), downloading it will automatically re-fetch from cloud.
