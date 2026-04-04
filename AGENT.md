# MyCloud — AI Agent Guide

## Development Environment

> **OS**: Windows | **Shell**: PowerShell  
> Tất cả lệnh trong project này đều chạy trên **PowerShell** (Windows).  
> Không dùng cú pháp Bash (`&&`, `rm`, `export`, …). Luôn dùng cú pháp PowerShell tương ứng.

| Bash | PowerShell |
|------|------------|
| `cd a && cmd` | `Set-Location a; cmd` hoặc chạy 2 lệnh riêng |
| `export VAR=val` | `$env:VAR = "val"` |
| `rm -rf dir` | `Remove-Item -Recurse -Force dir` |
| `cat file` | `Get-Content file` |
| `mkdir -p dir` | `New-Item -ItemType Directory -Force dir` |
| `cp src dst` | `Copy-Item src dst` |
| `mv src dst` | `Move-Item src dst` |

## Overview

MyCloud is a self-hosted personal cloud photo/video storage system built with:
- **Backend**: Rust (Axum 0.8) + SQLite (via sqlx)
- **Frontend**: Vite + React + TypeScript (managed by Bun)
- **Storage**: Local filesystem or CloudStore (external REST API with SSE-C encryption support)
- **Deployment**: Single static binary in scratch Docker image (~15-20MB)
- **Security**: Optional E2EE encryption with zero-knowledge envelope key architecture

## Project Structure

```
G:\Personal\MyCloud\
├── backend/
│   ├── Cargo.toml              # Rust dependencies
│   ├── .env                    # Environment configuration
│   ├── data/                   # Runtime data (DB + uploads)
│   │   ├── db/                 # SQLite database files
│   │   └── uploads/            # Uploaded media files
│   ├── embedded-frontend/      # Vite build output (embedded in binary)
│   ├── migrations/             # SQL migration files (auto-applied on startup)
│   │   ├── 20260322100000_init.sql
│   │   ├── 20260328100000_create_jobs.sql
│   │   ├── 20260330100000_geo_index.sql
│   │   └── 20260403_encryption_support.sql
│   └── src/
│       ├── main.rs             # Axum server, routes, AppState
│       ├── config.rs           # ENV-based configuration
│       ├── crypto.rs           # E2EE: KEK/MK/DEK envelope encryption, seal/unseal, recovery keys
│       ├── auth/
│       │   ├── jwt.rs          # JWT token create/verify, sealed MK transport
│       │   ├── middleware.rs   # Global Auth middleware (require_auth, require_admin)
│       │   └── password.rs     # bcrypt hash/verify
│       ├── db/
│       │   ├── mod.rs          # SQLite pool init & migrations
│       │   └── seed.rs         # Admin user seeding
│       ├── jobs.rs             # SQLite-backed persistent background jobs queue
│       ├── imaging/
│       │   ├── exif.rs         # EXIF metadata extraction
│       │   ├── job_queue.rs    # Background processing: thumbnails, EXIF, blur hash
│       │   ├── mod.rs          # Imaging module exports
│       │   └── thumbnail.rs    # Multi-size WebP thumbnail generation (encryption-aware)
│       ├── models/             # Serde structs for DB records
│       │   ├── album.rs
│       │   ├── media.rs        # includes is_encrypted field
│       │   ├── mosaic.rs       # Timeline/Mosaic grouping logic
│       │   ├── shared_link.rs
│       │   ├── upload_session.rs
│       │   └── user.rs         # includes encrypted_master_key, encryption_salt, encryption_enabled
│       ├── routes/
│       │   ├── mod.rs          # Module declarations
│       │   ├── admin.rs        # Admin panel endpoints
│       │   ├── album.rs        # Album CRUD endpoints
│       │   ├── auth.rs         # Login/register (with MK unsealing + HttpOnly cookie)
│       │   ├── encryption.rs   # E2EE: enable/disable/status/recover
│       │   ├── explorer.rs     # Explorer (Memories, Stats, Screenshots)
│       │   ├── health.rs       # Health check + system stats
│       │   ├── media.rs        # Media CRUD + serve/download (encryption-aware proxy)
│       │   ├── mosaic.rs       # Timeline mosaic API
│       │   ├── search.rs       # Full-text search endpoint
│       │   ├── share.rs        # Shared links management
│       │   ├── upload.rs       # File upload pipeline (DEK derivation for encrypted uploads)
│       │   └── user.rs         # User profile + password change (MK re-wrap)
│       ├── storage/
│       │   ├── mod.rs          # StorageProvider trait + factory (with *_encrypted methods)
│       │   ├── local.rs        # Local filesystem provider
│       │   └── cloudstore.rs   # CloudStore REST API provider (injects X-Encryption-Key)
│       ├── error.rs            # AppError enum
│       └── metrics.rs          # Prometheus-style metrics
├── frontend/
│   ├── package.json            # Bun-managed dependencies
│   ├── vite.config.ts          # Vite config (proxy → backend)
│   └── src/
│       ├── App.tsx             # React Router configuration
│       ├── index.css           # Full design system + responsive CSS
│       ├── api/client.ts       # Typed API client class (incl. encryption methods)
│       ├── hooks/
│       │   ├── useMediaData.ts     # Media fetching, polling, mutations
│       │   └── useMediaSelection.ts # Selection logic (click, shift, touch, drag)
│       ├── components/
│       │   ├── gallery/
│       │   │   ├── VirtualizedMediaGrid.tsx  # @tanstack/react-virtual grid
│       │   │   ├── MediaTile.tsx     # Memoized tile (BlurHash → Image)
│       │   │   ├── BlurHashCanvas.tsx # BlurHash decoder canvas
│       │   │   ├── GalleryHeader.tsx  # Title + view mode toggle
│       │   │   ├── SelectionActionBar.tsx # Floating selection bar
│       │   │   ├── AlbumModal.tsx     # Add-to-album modal
│       │   │   ├── ShareModal.tsx     # Share link modal
│       │   │   ├── Lightbox.tsx       # Full-screen image viewer
│       │   │   └── ViewModeToggle.tsx  # View mode selector
│       │   ├── layout/         # Sidebar, Header, SearchBar
│       │   └── upload/         # GlobalUploadModal
│       └── pages/
│           ├── Gallery.tsx     # Photo grid (orchestrator)
│           ├── Favorites.tsx   # Favorited media
│           ├── Trash.tsx       # Soft-deleted media
│           ├── Albums.tsx      # Album list
│           ├── AlbumDetail.tsx # Single album view
│           ├── Admin.tsx       # User management
│           ├── Dashboard.tsx   # System dashboard
│           ├── Settings.tsx    # Profile, password, encryption toggle, recovery key
│           ├── Map.tsx         # Geo-tagged media map
│           ├── Explorer.tsx    # Memories, screenshots, stats
│           ├── Mosaic.tsx      # Timeline mosaic view
│           ├── SharedLinks.tsx # Shared links management
│           ├── PublicShare.tsx # Public share viewer
│           ├── Login.tsx       # Login page
│           └── Register.tsx    # Registration page
├── cloud-store/                # External storage service (separate Rust project)
│   ├── crates/
│   │   ├── cloudstore-api/     # REST API for file storage (SSE-C ChaCha20 encryption)
│   │   └── cloudstore-cache/   # Cache engine
│   ├── API.md                  # CloudStore API documentation
│   └── docker-compose.yml      # CloudStore deployment
└── deploy/
    ├── Dockerfile              # Multi-stage: Bun + Rust MUSL → scratch
    └── docker-compose.yml      # Production deployment
```

## Critical Patterns

### SQLite via Sqlx

We use SQLite for relational data mapping, with `sqlx` as the query builder and driver.

**Database Connections:**
Database pools (`SqlitePool`) are initialized in `src/db/mod.rs` and exposed globally via the `AppState`.

**JSON Fields:**
SQLite stores nested arrays and objects (e.g., settings, metadata, thumbnails) as `TEXT`. In models, wrap these with `sqlx::types::Json` for automated zero-cost Serde wrapping.

```rust
// In struct definitions:
pub settings: sqlx::types::Json<UserSettings>,
```

**Macro limitations:**
Compile-time macros like `sqlx::query!` are generally avoided since they require a `.env` database URL pointing to an existing initialized schema file during Cargo Check/Build. Stick to `sqlx::query("...")` and `sqlx::query_as` at runtime unless specifically handled.

### Storage Provider

- `STORAGE_PROVIDER=local` — Files stored to `UPLOAD_DIR` (default: `./data/uploads`)
- `STORAGE_PROVIDER=cloudstore` — Delegates to external CloudStore API via HTTP
  - Requires `CLOUDSTORE_URL` and optionally `CLOUDSTORE_API_KEY`
  - CloudStore API: `PUT/GET/DELETE /api/files/{provider}/{path}` with Bearer auth
  - **Streaming:** Media routes proxy HTTP `Range` requests directly via `reqwest` `bytes_stream` without buffering into memory, maintaining efficient video playback.
  - **Encryption:** `StorageProvider` trait exposes `upload_encrypted`, `read_encrypted`, `upload_thumbnail_encrypted` methods. `CloudStoreProvider` injects `X-Encryption-Key` header for SSE-C.

### E2EE Encryption Architecture

Zero-knowledge envelope encryption with 3-layer key hierarchy:

```
Password ──Argon2id──→ KEK ──AES-256-GCM──→ wraps Master Key (MK)
                                                    │
                                              HKDF-SHA256
                                                    │
                                              DEK (per file)
                                                    │
                                          X-Encryption-Key header
                                                    │
                                          CloudStore ChaCha20 (SSE-C)
```

**Key management:**
- **KEK** (Key Encryption Key): Derived from user password via Argon2id with random salt
- **MK** (Master Key): Random 256-bit key, wrapped/unwrapped by KEK for DB storage
- **DEK** (Data Encryption Key): Per-file key derived via HKDF-SHA256(MK, file_id)
- **Sealed MK**: MK encrypted with JWT_SECRET for transport in JWT claims + HttpOnly cookie

**Transport mechanism:**
- JWT `encrypted_mk` claim: used by authenticated API routes
- `__mc_mk` HttpOnly cookie: used by public media serve route (for `<img>` tags)

**Opt-in model:** Encryption is per-user and only affects newly uploaded files.

**Recovery key:** Base58-encoded raw MK shown once on enable, allows re-wrapping with new password.

### Gallery Architecture (Virtualized)

The Gallery page is architected as a thin orchestrator (`pages/Gallery.tsx` ~230 lines) that delegates to:

- **Hooks**: `useMediaData` (data fetching with **lazy pagination**/polling/mutations — only loads next page when scrolled near bottom), `useMediaSelection` (click/shift/touch/drag selection)
- **VirtualizedMediaGrid**: Uses `@tanstack/react-virtual` `useWindowVirtualizer` to render only visible rows using **window scroll** (no internal scroll container). Media is grouped by date → flattened into virtual rows (headers + media rows). Each row is absolutely positioned with `translateY`.
- **MediaTile**: `React.memo` with custom comparator. Progressive loading: Skeleton shimmer → BlurHash canvas (32×32 decoded) → actual image (fade-in).
- **Sticky Date Headers**: Date group headers use `position: fixed` overlay derived from virtualizer scroll offsets.
- **Lightbox**: Uses CSS crossfade for smooth image transitions. `ProgressiveImage` uses dual-img layering (thumbnail underneath, full-res fades in on top).

Key dependencies: `@tanstack/react-virtual`, `blurhash`.

### Border Convention

Borders should always use `border-outline-variant/15` to `border-outline-variant/30` (with Tailwind opacity). Never use full-opacity borders. The dark mode `--outline-variant` is intentionally subtle (`#1e1e2e`) — adding opacity keeps borders barely visible for a premium feel.

### Build & Deployment

Frontend is built with `bun run build` into `backend/embedded-frontend/`, which is embedded into the Rust binary via `rust-embed`. Use `bun dev` for development with Vite proxy.

**Docker Caching:** The multi-stage `Dockerfile` uses a dummy `main.rs` to cache dependencies. To prevent `mtime` caching bugs causing empty binary builds, `RUN find src -type f -exec touch {} +` is used before compiling the real source code.

**Scratch Image TLS:** `reqwest` requires the `rustls-tls-webpki-roots` feature explicitly enabled to perform HTTPS proxy requests in the final `<scratch>` container, as it lacks standard OS root certificates (`/etc/ssl/certs`).

## Common Commands (PowerShell)

```powershell
# Development
Set-Location backend; .\dev.bat              # Start backend at :3000
Set-Location frontend; bun dev               # Start frontend dev server at :5173
Set-Location cloud-store; .\dev.bat          # Start CloudStore service

# Build
Set-Location frontend; bun run build         # Build frontend → embedded-frontend/
Set-Location backend; cargo build --release  # Build optimized binary

# Check & Test
Set-Location backend; cargo check            # Type-check backend
Set-Location backend; cargo test crypto      # Run crypto unit tests

# Reset database
Remove-Item -Force backend\data\db\mycloud.db*

# Docker
.\deploy\build-image.bat                     # Build Docker image
docker compose -f deploy\docker-compose.yml up -d
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `3000` | Server port |
| `DB_PATH` | `./data/db` | SQLite database directory |
| `UPLOAD_DIR` | `./data/uploads` | File upload directory |
| `JWT_SECRET` | `mycloud-dev-secret...` | JWT signing secret (also used to seal Master Key) |
| `ADMIN_EMAIL` | `admin@mycloud.local` | Admin account email |
| `ADMIN_PASSWORD` | `Admin@123456` | Admin account password |
| `ADMIN_NAME` | `Administrator` | Admin display name |
| `MAX_CONCURRENT_UPLOADS` | `6` | Background job concurrency |
| `STORAGE_PROVIDER` | `local` | `local` or `cloudstore` |
| `CLOUDSTORE_URL` | *(none)* | CloudStore service URL |
| `CLOUDSTORE_API_KEY` | *(none)* | CloudStore API key |

## API Endpoints (45)

| Group | Method | Path | Auth |
|-------|--------|------|------|
| Auth | POST | `/api/auth/login` | No |
| Auth | POST | `/api/auth/register` | No |
| Auth | GET | `/api/auth/download-token` | Yes |
| Media | GET | `/api/media` | Yes |
| Media | GET | `/api/media/{id}` | Yes |
| Media | DELETE | `/api/media/{id}` | Yes |
| Media | PUT | `/api/media/{id}/favorite` | Yes |
| Media | POST | `/api/media/{id}/restore` | Yes |
| Media | GET | `/api/media/{id}/download` | Yes |
| Media | GET | `/api/media/serve/{*path}` | Cookie |
| Media | GET | `/api/media/geo` | Yes |
| Media | GET | `/api/media/timeline` | Yes |
| Upload | POST | `/api/upload/session` | Yes |
| Upload | POST | `/api/upload/file` | Yes |
| Upload | POST | `/api/upload/chunk` | Yes |
| Upload | POST | `/api/upload/complete` | Yes |
| User | GET | `/api/user/profile` | Yes |
| User | PUT | `/api/user/profile` | Yes |
| User | PUT | `/api/user/password` | Yes |
| Albums | GET | `/api/albums` | Yes |
| Albums | POST | `/api/albums` | Yes |
| Albums | GET | `/api/albums/{id}` | Yes |
| Albums | PUT | `/api/albums/{id}` | Yes |
| Albums | DELETE | `/api/albums/{id}` | Yes |
| Albums | POST | `/api/albums/{id}/media` | Yes |
| Albums | DELETE | `/api/albums/{id}/media` | Yes |
| Admin | GET | `/api/admin/stats` | Yes |
| Admin | GET | `/api/admin/dashboard` | Yes |
| Admin | GET | `/api/admin/users` | Yes |
| Admin | PUT | `/api/admin/users/{id}` | Yes |
| Admin | DELETE | `/api/admin/users/{id}` | Yes |
| Admin | POST | `/api/admin/users/{id}/reset-password` | Yes |
| Share | POST | `/api/share` | Yes |
| Share | GET | `/api/share` | Yes |
| Share | DELETE | `/api/share/{id}` | Yes |
| Search | GET | `/api/search?q=` | Yes |
| Explorer | GET | `/api/explorer/memories` | Yes |
| Explorer | GET | `/api/explorer/screenshots` | Yes |
| Explorer | GET | `/api/explorer/stats` | Yes |
| Encryption | POST | `/api/encryption/enable` | Yes |
| Encryption | POST | `/api/encryption/disable` | Yes |
| Encryption | GET | `/api/encryption/status` | Yes |
| Encryption | POST | `/api/encryption/recover` | Yes |
| Health | GET | `/api/health` | No |
| Health | GET | `/api/stats` | No |
| Public | GET | `/api/s/{token}` | No |

## Verification Guidelines

> **Không tự mở trình duyệt để test.** Khi cần kiểm tra UI hoặc chức năng:
> 1. Hỏi người dùng thông tin cần thiết (screenshot, console log, kết quả thực tế, …)
> 2. Kiểm tra bằng lệnh CLI / API (ví dụ: `curl`, `Invoke-RestMethod`) nếu có thể
> 3. Đọc log từ terminal đang chạy để xác minh kết quả
>
> Nếu cần thêm thông tin, **luôn hỏi người dùng** thay vì tự giả định.
