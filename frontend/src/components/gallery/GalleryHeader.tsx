type ViewMode = 'timeline' | 'grid-large' | 'grid-medium' | 'grid-small'

interface GalleryHeaderProps {
  title: string
  totalItems: number
  mediaCount: number
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  selectionMode: boolean
  cancelSelection: () => void
}

const viewModes: { mode: ViewMode; icon: string; title: string }[] = [
  { mode: 'timeline', icon: 'view_timeline', title: 'Dòng thời gian' },
  { mode: 'grid-large', icon: 'grid_view', title: 'Lưới lớn' },
  { mode: 'grid-medium', icon: 'apps', title: 'Lưới vừa' },
  { mode: 'grid-small', icon: 'view_comfy', title: 'Lưới nhỏ' },
]

export default function GalleryHeader({
  title, totalItems, mediaCount, viewMode, setViewMode,
  selectionMode, cancelSelection,
}: GalleryHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-1 md:gap-4 mb-1 md:mb-12">
      {/* Top row: title + view toggle on mobile, just title on desktop */}
      <div className="flex items-center justify-between md:block">
        <div>
          <h2 className="text-lg md:text-5xl font-extrabold font-headline text-on-surface tracking-tight mb-0 md:mb-2">{title}</h2>
          <p className="hidden md:block text-base text-on-surface-variant font-medium">{totalItems || mediaCount} mục đã lưu trữ an toàn</p>
        </div>

        {/* View mode toggle — inline with title on mobile */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="flex bg-surface-container rounded-lg p-0.5">
            {viewModes.map(({ mode, icon, title: modeTitle }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${
                  viewMode === mode
                    ? 'bg-surface text-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                title={modeTitle}
              >
                <span className="material-symbols-outlined text-[18px]" data-icon={icon}>{icon}</span>
              </button>
            ))}
          </div>

          {selectionMode && (
            <button
              onClick={cancelSelection}
              className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 bg-primary text-white shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]" data-icon="close">close</span>
              Hủy
            </button>
          )}
        </div>
      </div>

      {/* Desktop: view mode toggle + cancel selection */}
      <div className="hidden md:flex items-center gap-4">
        <div className="flex bg-surface-container rounded-lg p-1">
          {viewModes.map(({ mode, icon, title: modeTitle }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`p-2 rounded-md flex items-center justify-center transition-colors ${
                viewMode === mode
                  ? 'bg-surface text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              title={modeTitle}
            >
              <span className="material-symbols-outlined text-[20px]" data-icon={icon}>{icon}</span>
            </button>
          ))}
        </div>

        {selectionMode && (
          <div className="flex bg-surface-container p-1 rounded-xl">
            <button
              onClick={cancelSelection}
              className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors bg-primary text-white shadow-sm"
            >
              <span className="material-symbols-outlined text-[20px]" data-icon="close">close</span>
              Hủy chọn
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
