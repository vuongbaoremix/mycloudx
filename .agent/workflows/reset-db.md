---
description: How to reset the database and start fresh
---

## Steps

1. Stop the backend server if running (Ctrl+C)

2. Delete the SQLite database file:
```powershell
Remove-Item -Force backend\data\db\mycloud.db*
```

3. Restart the backend:
```powershell
Set-Location backend; .\dev.bat
```

4. Schema will be re-applied via `sqlx::migrate!` and admin user re-seeded automatically

## Notes
- This preserves uploaded files in `backend\data\uploads\`
- To also reset uploads: `Remove-Item -Recurse -Force backend\data\uploads`
- Admin credentials are from `.env` (default: `admin@mycloud.local` / `Admin@123456`)
- After reset, encryption is disabled for all users — they must re-enable and get a new Recovery Key
- Existing encrypted files in CloudStore will become inaccessible without the original Master Key
