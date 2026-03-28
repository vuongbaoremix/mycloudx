---
description: How to add a new frontend page
---

## Steps

1. Create the page component at `frontend/src/pages/{PageName}.tsx`

2. Use the existing API client for data fetching:
```tsx
import api from '../api/client'
```

   For gallery-related pages, use the shared hooks:
```tsx
import { useMediaData } from '../hooks/useMediaData'
import { useMediaSelection } from '../hooks/useMediaSelection'
```

3. Add the route in `frontend/src/App.tsx`:
```tsx
import PageName from './pages/PageName'
// Inside <Routes>:
<Route path="/page-name" element={<PageName />} />
```

4. (Optional) Add navigation in `frontend/src/components/layout/Sidebar.tsx`:
```tsx
{ icon: IconComponent, label: 'Page Name', path: '/page-name' }
```

5. Add any new API methods to `frontend/src/api/client.ts`:
```typescript
async myMethod(param: string) {
  return this.request<ResponseType>(`/endpoint/${param}`);
}
```

6. Build the frontend:
```powershell
Set-Location frontend; bun run build
```

7. Hỏi người dùng kiểm tra trang mới trên trình duyệt và xác nhận kết quả

## Design System
- Use TailwindCSS with semantic tokens (see `.agent/skills/design-system/SKILL.md`)
- Colors: `bg-surface`, `text-on-surface`, `text-on-surface-variant`, `bg-primary`, etc.
- Button classes: `btn btn-primary`, `btn btn-secondary`, `btn btn-ghost`, `btn btn-danger`
- Fonts: `font-headline` (Manrope), `font-body` (Inter)
- Icons: `material-symbols-outlined` or `lucide-react`
- All UI text **must** be in Vietnamese
