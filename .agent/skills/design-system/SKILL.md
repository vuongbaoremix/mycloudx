---
name: MyCloud Design System
description: TailwindCSS based design system with built-in dark mode, semantic color tokens, standardized component patterns, and Vietnamese UI language
---

# MyCloud Design System

The project uses **TailwindCSS (v3)** for styling, configured to support dynamic theming (Dark / Light mode) with semantic variables mapped to Tailwind's colors configuration.

## Tailwind Configuration

The core configuration lives in `frontend/tailwind.config.js`. It defines custom colors matching the application's semantic requirements and Google Fonts:

```js
// Key semantic colors (excerpt)
theme: {
  extend: {
    colors: {
      "primary": "var(--md-primary)",
      "surface": "var(--md-surface)",
      "on-surface": "var(--md-on-surface)",
      "on-surface-variant": "var(--md-on-surface-variant)",
      "surface-container": "var(--md-surface-container)",
      "surface-container-high": "var(--md-surface-container-high)",
      "surface-container-highest": "var(--md-surface-container-highest)",
      "surface-container-low": "var(--md-surface-container-low)",
      "surface-container-lowest": "var(--md-surface-container-lowest)",
      "outline-variant": "var(--md-outline-variant)",
      "error-container": "var(--md-error-container)",
      "on-error-container": "var(--md-on-error-container)",
      "danger": "var(--md-danger)",
      "success": "var(--md-success)",
      // etc...
    },
    fontFamily: {
      "headline": ["Manrope"],
      "body": ["Inter"],
      "label": ["Inter"],
    }
  }
}
```

## Theme Switching

The project uses class-based dark mode (`darkMode: 'class'`).

**How to toggle theme:**
Add or remove the `dark` and `light` class on the `<html>` element. The custom semantic color palette handles the contrast automatically.

```html
<html class="light"> <!-- Light mode -->
<html class="dark"> <!-- Dark mode -->
```

## Semantic Token Rules

> **CRITICAL: Never use hardcoded colors** like `text-gray-500`, `bg-slate-800`, `text-[#1e293b]`, `dark:bg-[#12121a]`, or `bg-white dark:bg-slate-900`.
> Always use semantic tokens:

| Instead of | Use |
|---|---|
| `text-gray-500`, `text-slate-400` | `text-on-surface-variant` |
| `text-[#1e293b]`, `text-slate-200` | `text-on-surface` |
| `bg-white dark:bg-[#12121a]` | `bg-surface` |
| `bg-gray-50 dark:bg-[#1a1a25]` | `bg-surface-container-lowest` |
| `bg-gray-100 dark:bg-white/10` | `bg-surface-container` |
| `border-gray-100 dark:border-white/10` | `border-outline-variant/20` |
| `border-gray-200` | `border-outline-variant/15` ~ `/30` |
| `text-red-500` | `text-danger` |
| `hover:bg-gray-100 dark:hover:bg-white/10` | `hover:bg-surface-container` |
| `style={{ fontSize: 20, fontWeight: 600 }}` | Tailwind: `text-xl font-semibold` |

## Standardized Component Patterns

### Page Headings
```tsx
<h1 className="text-2xl font-extrabold font-headline text-on-surface tracking-tight">
  Page Title
</h1>
```

### Modal Pattern
All modals MUST follow this exact structure:
```tsx
{showModal && (
  <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-fadeIn">
    <div className="bg-surface rounded-3xl p-8 w-full max-w-md shadow-2xl border border-outline-variant/20 animate-slideUp">
      <h3 className="text-2xl font-bold font-headline mb-6 text-on-surface tracking-tight">
        Title
      </h3>
      {/* Content */}
      <div className="flex gap-3 justify-end mt-8">
        <button className="btn btn-secondary px-6" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary px-6" onClick={onConfirm}>Confirm</button>
      </div>
    </div>
  </div>
)}
```

**Modal rules:**
- Overlay: `bg-black/40 backdrop-blur-md animate-fadeIn`
- Card: `bg-surface rounded-3xl p-8 shadow-2xl border border-outline-variant/20 animate-slideUp`
- Heading: `text-2xl font-bold font-headline text-on-surface tracking-tight`
- Form labels: `text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2`
- Buttons: Always use `px-6` for consistent padding

### View Mode Toggle
Use the reusable `ViewModeToggle` component for grid size switching:
```tsx
import ViewModeToggle, { type ViewMode } from '../components/gallery/ViewModeToggle'

// In component:
const [viewMode, setViewMode] = useState<ViewMode>('grid-medium')

// In JSX:
<ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
```

### Selection Toolbar (Gallery floating bar)
```tsx
<div className="bg-surface-container-high/90 backdrop-blur-xl px-6 py-3 rounded-full
  shadow-2xl border border-white/20 flex items-center gap-4">
  {/* Icon buttons: p-2 bg-surface hover:bg-surface-container rounded-full */}
</div>
```

### Sidebar Navigation Links
```tsx
// Active link:
"flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold
 bg-primary/10 text-primary border-r-[3px] border-primary"

// Inactive link:
"flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold
 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
```

### Header
```tsx
<header className="bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20 ...">
```

## Material Symbols

The project uses Google Material Symbols Outlined. Use `span` tags with `material-symbols-outlined` class:
```html
<span class="material-symbols-outlined" data-icon="image">image</span>
```

## Typography

- **Headline (`font-headline`)**: Manrope font for titles and prominent headings
- **Body (`font-body`) / Label (`font-label`)**: Inter font for regular text and UI elements

## Inline Style Rules

> **CRITICAL: Never use inline styles** like `style={{ fontSize: 20, maxWidth: 500 }}`.
> Convert all inline styles to Tailwind utility classes:
> - `style={{ fontSize: 20 }}` → `text-xl`
> - `style={{ fontWeight: 600 }}` → `font-semibold`
> - `style={{ maxWidth: 500 }}` → `max-w-[500px]`
> - `style={{ display: 'flex' }}` → `flex`
> - `style={{ marginBottom: 16 }}` → `mb-4`

For extremely complex UI elements with custom logic (e.g., custom scrollbars), use global CSS in `frontend/src/index.css` via `@layer components`.

## Gallery & Virtualization Patterns

The Gallery uses windowed virtualization (`@tanstack/react-virtual`) to handle large collections. When building gallery-related features:

### Progressive Image Loading
Media tiles use a 3-stage loading sequence:
1. **Skeleton shimmer** — `skeleton-shimmer` class with `bg-surface-container`
2. **BlurHash preview** — `<BlurHashCanvas hash={item.blur_hash} />` (32×32 canvas scaled up)
3. **Actual image** — `<img>` with `opacity` fade-in transition on `onLoad`

### Memoized MediaTile
`MediaTile` uses `React.memo` with custom comparator. Only re-renders when:
- `item.id`, `item.is_favorite`, `item.status`, `item._previewUrl` change
- `isSelected`, `selectionMode`, `viewMode`, `idx` change

### VirtualizedMediaGrid
Uses `useWindowVirtualizer` (window scroll — no internal scroll container). Groups media by date → flattens into virtual rows (header rows + media rows). Each row is rendered via `position: absolute` + `translateY`. Gap between rows is handled by adding `paddingBottom: gapPx` to each row container. Container width is measured via `ResizeObserver` for accurate row height estimation.

### Lazy Pagination
`useMediaData` loads page 1 on mount. Additional pages only load when the user scrolls near the bottom (IntersectionObserver on a sentinel element). `loadMore()` and `hasMore` are exposed for the grid to trigger.

### Lightbox Transitions
Image transitions use CSS crossfade (no Framer Motion `AnimatePresence` for main image). `ProgressiveImage` renders dual `<img>`: thumbnail underneath, full-res fades in on top via opacity transition.

### Shared Hooks
- `useMediaData()` — Data fetching, polling, favorite/delete mutations
- `useMediaSelection(media)` — Click, shift+click, touch long-press, swipe-to-select

## Vietnamese Language Rule

> **CRITICAL: All user-facing UI text MUST be in Vietnamese.**
> Never add English labels, tooltips, headings, or placeholder text. Brand names (MyCloudX, CloudStore) are exempt.

### Common Translation Table

| English | Vietnamese |
|---|---|
| Photos | Ảnh |
| Videos | Video |
| Explore | Khám phá |
| Favorites | Yêu thích |
| Albums | Album |
| Map | Bản đồ |
| Trash | Thùng rác |
| Dashboard | Bảng điều khiển |
| Settings | Cài đặt |
| Search | Tìm kiếm |
| Upload | Tải lên |
| Download | Tải xuống |
| Share | Chia sẻ |
| Delete | Xóa |
| Cancel | Hủy |
| Create | Tạo |
| Save | Lưu |
| Close | Đóng |
| Copy | Sao chép |
| Select | Chọn |
| Selected | Đã chọn |
| Large Grid | Lưới lớn |
| Medium Grid | Lưới vừa |
| Small Grid | Lưới nhỏ |
| Timeline | Dòng thời gian |
| Album Name | Tên Album |
| Description | Mô tả |
| items | mục |
| Refresh | Làm mới |
| Connected | Đã kết nối |
| Pending | Đang chờ |
| Processing | Đang xử lý |
| Completed | Hoàn thành |
| Failed | Thất bại |
| Synced | Đã đồng bộ |
| Syncing | Đang đồng bộ |
