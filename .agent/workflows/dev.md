---
description: How to run the development environment
---
// turbo-all

## Steps

1. Start the backend server:
```powershell
Set-Location backend; cargo run
```
Server starts at `http://localhost:3000`

2. Start the frontend dev server (in a separate terminal):
```powershell
Set-Location frontend; bun dev
```
Frontend dev server at `http://localhost:5173` with proxy to backend

3. Hỏi người dùng xác nhận server đã chạy thành công (nếu cần kiểm tra giao diện hoặc chức năng, hỏi người dùng cung cấp screenshot hoặc mô tả kết quả)

4. Login with default admin credentials:
- Email: `admin@mycloud.local`
- Password: `Admin@123456`

## Notes
- Backend must be started first (API dependency)
- Frontend hot-reloads on changes
- Backend requires manual restart on Rust changes
- Use `cargo watch -x run` for auto-restart (install with `cargo install cargo-watch`)
- Auto-applies SQLite schema migrations on start.
- **Không tự mở trình duyệt để test** — hỏi người dùng nếu cần xác minh UI
