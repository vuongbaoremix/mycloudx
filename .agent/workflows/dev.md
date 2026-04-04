---
description: How to run the development environment
---
// turbo-all

## Steps

1. Start the CloudStore service (if using cloudstore storage):
```powershell
Set-Location cloud-store; .\dev.bat
```
CloudStore starts at its configured port (see `cloud-store/.env`)

2. Start the backend server:
```powershell
Set-Location backend; .\dev.bat
```
Server starts at `http://localhost:3000`. Auto-applies pending SQL migrations.

3. Start the frontend dev server (in a separate terminal):
```powershell
Set-Location frontend; bun dev
```
Frontend dev server at `http://localhost:5173` with proxy to backend

4. Login with default admin credentials:
- Email: `admin@mycloud.local`
- Password: `Admin@123456`

## Notes
- CloudStore must be started first if `STORAGE_PROVIDER=cloudstore`
- Backend must be started before frontend (API dependency)
- Frontend hot-reloads on changes
- Backend requires manual restart on Rust changes (or use `cargo watch -x run`)
- Auto-applies SQLite schema migrations on start via `sqlx::migrate!`
- **Không tự mở trình duyệt để test** — hỏi người dùng nếu cần xác minh UI

## Encryption Testing
After login, go to **Settings → Bảo mật & Mật khẩu → Mã hóa dữ liệu (E2EE)**:
1. Enter current password in the confirmation field
2. Click "Bật mã hóa" to enable
3. **Save the Recovery Key** shown in the modal — it's only displayed once
4. New uploads will be encrypted; existing files remain unencrypted
