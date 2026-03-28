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
- **Deployment**: Single static binary in scratch Docker image (~15-20MB)

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
│   └── src/
│       ├── main.rs             # Axum server, routes, Claims extractor
│       ├── config.rs           # ENV-based configuration
│       ├── auth/
│       │   ├── jwt.rs          # JWT token create/verify
│       │   ├── middleware.rs   # Global Auth middleware
│       │   └── password.rs     # bcrypt hash/verify
│       ├── db/
│       │   ├── mod.rs          # SQLite pool init & migrations
│       │   └── seed.rs         # Admin user seeding
│       ├── imaging/
│       │   ├── exif.rs         # EXIF metadata extraction
│       │   └── thumbnail.rs    # Multi-size WebP (webp crate, variable quality)
│       ├── models/             # Serde structs for DB records
│       │   ├── album.rs
│       │   ├── media.rs
│       │   ├── mosaic.rs       # Timeline/Mosaic grouping logic
│       │   ├── shared_link.rs
│       │   ├── upload_session.rs
│       │   └── user.rs
│       ├── routes/
│       │   ├── admin.rs        # Admin panel endpoints
│       │   ├── album.rs        # Album CRUD endpoints
│       │   ├── auth.rs         # Login/register endpoints
│       │   ├── health.rs       # Health check + system stats
│       │   ├── media.rs        # Media CRUD + serve/download
│       │   ├── search.rs       # Full-text search endpoint
│       │   ├── share.rs        # Shared links management
│       │   ├── upload.rs       # File upload pipeline
│       │   └── user.rs         # User profile endpoints
│       └── storage/
│           ├── mod.rs          # StorageProvider trait + factory
│           ├── local.rs        # Local filesystem provider
│           └── cloudstore.rs   # CloudStore REST API provider
├── frontend/
│   ├── package.json            # Bun-managed dependencies
│   ├── vite.config.ts          # Vite config (proxy → backend)
│   └── src/
│       ├── App.tsx             # React Router configuration
│       ├── index.css           # Full design system + responsive CSS
│       ├── api/client.ts       # Typed API client class
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
│       └── pages/              # Gallery (orchestrator), Favorites, Trash,
│                               # Albums, AlbumDetail, Admin, SharedLinks,
│                               # Settings, Dashboard, Mosaic, PublicShare
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

### Frontend Build
Frontend is built with `bun run build` into `backend/embedded-frontend/`, which is embedded into the Rust binary via `rust-embed`. Use `bun dev` for development with Vite proxy.

## Common Commands (PowerShell)

```powershell
# Development
Set-Location backend; cargo run              # Start backend at :3000
Set-Location frontend; bun dev               # Start frontend dev server at :5173

# Build
Set-Location frontend; bun run build         # Build frontend → embedded-frontend/
Set-Location backend; cargo build --release  # Build optimized binary

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
| `DATABASE_URL` | `sqlite:../data/db/mycloud.db` | SQLite connection string |
| `UPLOAD_DIR` | `./data/uploads` | File upload directory |
| `JWT_SECRET` | `mycloud-dev-secret...` | JWT signing secret |
| `ADMIN_EMAIL` | `admin@mycloud.local` | Admin account email |
| `ADMIN_PASSWORD` | `Admin@123456` | Admin account password |
| `STORAGE_PROVIDER` | `local` | `local` or `cloudstore` |
| `CLOUDSTORE_URL` | *(none)* | CloudStore service URL |
| `CLOUDSTORE_API_KEY` | *(none)* | CloudStore API key |

## API Endpoints (37)

| Group | Method | Path | Auth |
|-------|--------|------|------|
| Auth | POST | `/api/auth/login` | No |
| Auth | POST | `/api/auth/register` | No |
| Media | GET | `/api/media` | Yes |
| Media | GET | `/api/media/{id}` | Yes |
| Media | DELETE | `/api/media/{id}` | Yes |
| Media | PUT | `/api/media/{id}/favorite` | Yes |
| Media | POST | `/api/media/{id}/restore` | Yes |
| Media | GET | `/api/media/{id}/download` | Yes |
| Media | GET | `/api/media/serve/{*path}` | Yes |
| Media | GET | `/api/media/geo` | Yes |
| Media | GET | `/api/media/timeline` | Yes |
| Upload | POST | `/api/upload/session` | Yes |
| Upload | POST | `/api/upload/file` | Yes |
| User | GET | `/api/user/profile` | Yes |
| User | PUT | `/api/user/profile` | Yes |
| User | PUT | `/api/user/password` | Yes |
| Albums | GET/POST | `/api/albums` | Yes |
| Albums | GET/PUT/DELETE | `/api/albums/{id}` | Yes |
| Albums | POST/DELETE | `/api/albums/{id}/media` | Yes |
| Admin | GET | `/api/admin/stats` | Yes |
| Admin | GET | `/api/admin/users` | Yes |
| Admin | PUT/DELETE | `/api/admin/users/{id}` | Yes |
| Admin | POST | `/api/admin/users/{id}/reset-password` | Yes |
| Share | POST/GET | `/api/share` | Yes |
| Share | DELETE | `/api/share/{id}` | Yes |
| Search | GET | `/api/search?q=` | Yes |
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
