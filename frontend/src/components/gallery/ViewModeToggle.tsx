type ViewMode = 'grid-large' | 'grid-medium' | 'grid-small'

interface ViewModeToggleProps {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
}

export default function ViewModeToggle({ viewMode, setViewMode }: ViewModeToggleProps) {
  const modes: { mode: ViewMode; icon: string; title: string }[] = [
    { mode: 'grid-large', icon: 'grid_view', title: 'Lưới lớn' },
    { mode: 'grid-medium', icon: 'apps', title: 'Lưới vừa' },
    { mode: 'grid-small', icon: 'view_comfy', title: 'Lưới nhỏ' },
  ]

  return (
    <div className="flex bg-surface-container rounded-lg p-1">
      {modes.map(({ mode, icon, title }) => (
        <button
          key={mode}
          onClick={() => setViewMode(mode)}
          className={`p-2 rounded-md flex items-center justify-center transition-colors ${
            viewMode === mode
              ? 'bg-surface text-primary shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
          title={title}
        >
          <span className="material-symbols-outlined text-[20px]" data-icon={icon}>{icon}</span>
        </button>
      ))}
    </div>
  )
}

export type { ViewMode }
