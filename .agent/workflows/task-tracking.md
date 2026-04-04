---
description: How to manage and track outstanding tasks
---
Luôn duy trì và cập nhật file `current-task.md` ở thư mục gốc của project (root directory). 
- Liệt kê các task đang làm hoặc tồn đọng vào file này.
- Khi hoàn thành bất kỳ task nào, lập tức xóa (hoặc đánh dấu tick) task đó khỏi `current-task.md`.
- File này luôn phải phản ánh đúng tiến độ hiện tại.
- Khi có thêm tính năng mới hoặc API mới được code xong, nhớ đồng bộ cập nhật:
  - `AGENT.md` — cập nhật project structure, API endpoints, environment variables
  - `.agent/workflows/` — cập nhật workflow nếu flow thay đổi
  - `.agent/skills/` — cập nhật skill nếu có pattern mới
