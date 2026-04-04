---
description: How to build the production Docker image
---
// turbo-all

## Steps

1. Build the frontend:
```powershell
Set-Location frontend; bun run build
```

2. Build the Rust binary (cross-compile for Linux MUSL):
```powershell
Set-Location backend; cross build --release --target x86_64-unknown-linux-musl
```

3. Build the Docker image:
```powershell
docker build -f deploy\Dockerfile -t mycloud:latest .
```

4. Run with docker-compose:
```powershell
docker compose -f deploy\docker-compose.yml up -d
```

## Notes
- Docker image is `scratch`-based (~15-20MB)
- TLS certs bundled via `webpki-roots` (no ca-certificates needed)
- Data persists in Docker volume mapped to `/data`
- `JWT_SECRET` in production must be a strong random string (also used to seal encryption Master Key)
- CloudStore should be deployed separately if using `STORAGE_PROVIDER=cloudstore`
- To prevent mtime caching bugs: `RUN find src -type f -exec touch {} +` before compiling real source
