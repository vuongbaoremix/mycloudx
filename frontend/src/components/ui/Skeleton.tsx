/**
 * Skeleton loading components cho MyCloudX
 * Dùng semantic tokens từ design system
 */

// Base skeleton block with shimmer animation
function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`skeleton-shimmer rounded-xl bg-surface-container ${className}`} />
  )
}

/** Skeleton grid cho Gallery / Favorites / Trash */
export function SkeletonGrid({ count = 12, viewMode = 'grid-medium' }: { count?: number; viewMode?: string }) {
  const items = Array.from({ length: count })

  let colSpan = 'col-span-4 md:col-span-4 lg:col-span-3 xl:col-span-2'
  let gap = 'gap-px md:gap-4'

  if (viewMode === 'grid-large') {
    colSpan = 'col-span-4 md:col-span-4 lg:col-span-4 xl:col-span-3'
    gap = 'gap-px md:gap-6'
  } else if (viewMode === 'grid-small') {
    colSpan = 'col-span-2 md:col-span-2 lg:col-span-2 xl:col-span-1'
    gap = 'gap-px md:gap-2'
  } else if (viewMode === 'timeline') {
    colSpan = 'col-span-3 md:col-span-3 lg:col-span-2'
    gap = 'gap-px md:gap-3'
  }

  return (
    <div className="max-w-[1800px] mx-auto px-1 md:px-8 py-1 md:py-10">
      {/* Header skeleton — matches Gallery header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-2 md:gap-4 mb-2 md:mb-12">
        <div>
          <SkeletonBlock className="h-6 md:h-12 w-32 md:w-56 mb-1 md:mb-2 rounded-lg" />
          <SkeletonBlock className="h-3 md:h-5 w-40 md:w-52 rounded-lg" />
        </div>
        {/* View toggle placeholder */}
        <div className="flex items-center gap-4">
          <div className="flex bg-surface-container rounded-lg p-1 gap-1">
            {[1,2,3,4].map(i => <SkeletonBlock key={i} className="h-9 w-9 rounded-md" />)}
          </div>
        </div>
      </div>

      {/* Date group header skeleton */}
      <div className="flex items-center gap-2 md:gap-4 mb-1.5 md:mb-4">
        <SkeletonBlock className="h-4 md:h-7 w-32 md:w-44 rounded-lg" />
        <div className="h-px flex-1 bg-surface-container" />
        <SkeletonBlock className="h-4 md:h-6 w-16 md:w-20 rounded-full" />
      </div>

      {/* Grid skeleton */}
      <div className={`grid grid-cols-12 ${gap}`}>
        {items.map((_, i) => {
          // Timeline first item is bigger
          const span = viewMode === 'timeline' && i === 0
            ? 'col-span-12 md:col-span-6 row-span-2 aspect-[4/3] md:aspect-auto'
            : viewMode === 'timeline' && (i === 1 || i === 2)
              ? 'col-span-6 md:col-span-3 aspect-square'
              : `${colSpan} aspect-square`
          return (
            <div key={i} className={`${span} rounded-none md:rounded-xl overflow-hidden`}>
              <SkeletonBlock className="w-full h-full !rounded-none md:!rounded-xl" />
            </div>
          )
        })}
      </div>

      {/* Second date group (smaller) */}
      <div className="mt-3 md:mt-16">
        <div className="flex items-center gap-2 md:gap-4 mb-1.5 md:mb-4">
          <SkeletonBlock className="h-4 md:h-7 w-24 md:w-36 rounded-lg" />
          <div className="h-px flex-1 bg-surface-container" />
          <SkeletonBlock className="h-4 md:h-6 w-16 md:w-24 rounded-full" />
        </div>
        <div className={`grid grid-cols-12 ${gap}`}>
          {Array.from({ length: Math.min(count, 6) }).map((_, i) => (
            <div key={i} className={`${colSpan} aspect-square rounded-none md:rounded-xl overflow-hidden`}>
              <SkeletonBlock className="w-full h-full !rounded-none md:!rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Skeleton cards cho Albums page */
export function SkeletonAlbumGrid({ count = 8 }: { count?: number }) {
  const items = Array.from({ length: count })

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 md:py-16">
      {/* Header skeleton */}
      <div className="mb-12">
        <SkeletonBlock className="h-12 w-56 mb-3 rounded-lg" />
        <SkeletonBlock className="h-6 w-80 rounded-lg" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-8 md:gap-12">
        {/* Create Album card placeholder */}
        <div className="aspect-square rounded-[2.5rem] border-[3px] border-dashed border-outline-variant/30 flex flex-col items-center justify-center">
          <SkeletonBlock className="w-16 h-16 !rounded-full mb-4" />
          <SkeletonBlock className="h-5 w-28 rounded-lg" />
        </div>

        {items.map((_, i) => (
          <div key={i} className="flex flex-col pt-4">
            {/* Stacked card effect — 3 layers */}
            <div className="relative aspect-square mb-5 w-full">
              <div className="absolute inset-0 rounded-[2.5rem] overflow-hidden translate-x-2 -translate-y-1 rotate-2 origin-bottom-left">
                <SkeletonBlock className="w-full h-full !rounded-[2.5rem] opacity-40" />
              </div>
              <div className="absolute inset-0 rounded-[2.5rem] overflow-hidden -translate-x-1 -translate-y-0.5 -rotate-1 origin-bottom-right z-10">
                <SkeletonBlock className="w-full h-full !rounded-[2.5rem] opacity-60" />
              </div>
              <div className="absolute inset-0 z-20 rounded-[2.5rem] overflow-hidden">
                <SkeletonBlock className="w-full h-full !rounded-[2.5rem]" />
              </div>
            </div>
            <div className="px-2">
              <SkeletonBlock className="h-6 w-32 mb-2 rounded-lg" />
              <SkeletonBlock className="h-4 w-20 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Skeleton cho Dashboard stats page */
export function SkeletonDashboard() {
  return (
    <div className="gallery-container pb-12">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-4 border-b border-outline-variant/20">
        <div>
          <SkeletonBlock className="h-8 w-56 mb-2 rounded-lg" />
          <SkeletonBlock className="h-4 w-72 rounded-lg" />
        </div>
        <div className="flex items-center gap-4">
          <SkeletonBlock className="h-5 w-24 rounded-full" />
          <SkeletonBlock className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* Section: Cơ sở dữ liệu */}
      <SkeletonBlock className="h-4 w-40 mb-4 rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card flex items-center gap-4">
            <SkeletonBlock className="w-12 h-12 !rounded-xl flex-shrink-0" />
            <div className="flex-1">
              <SkeletonBlock className="h-4 w-20 mb-2 rounded" />
              <SkeletonBlock className="h-8 w-16 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Section: Phần cứng */}
      <SkeletonBlock className="h-4 w-36 mb-4 mt-8 rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card">
            <SkeletonBlock className="h-4 w-16 mb-3 rounded" />
            <SkeletonBlock className="h-8 w-20 mb-2 rounded" />
            <SkeletonBlock className="h-1.5 w-full rounded-full mt-2" />
          </div>
        ))}
      </div>

      {/* Section: Hàng đợi */}
      <SkeletonBlock className="h-4 w-32 mb-4 mt-8 rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card">
            <SkeletonBlock className="h-4 w-20 mb-3 rounded" />
            <SkeletonBlock className="h-8 w-12 mb-2 rounded" />
            <SkeletonBlock className="h-3 w-28 rounded" />
          </div>
        ))}
      </div>

      {/* Section: CloudStore */}
      <SkeletonBlock className="h-4 w-36 mb-4 mt-8 rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card">
            <SkeletonBlock className="h-4 w-24 mb-3 rounded" />
            <SkeletonBlock className="h-8 w-16 mb-2 rounded" />
            <SkeletonBlock className="h-3 w-32 rounded" />
          </div>
        ))}
      </div>

      {/* Sync progress bar */}
      <div className="card mb-8">
        <SkeletonBlock className="h-4 w-40 mb-4 rounded" />
        <SkeletonBlock className="h-3 w-full rounded-full mb-4" />
        <div className="flex gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-4 w-24 rounded" />
          ))}
        </div>
      </div>

      {/* Bottom cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card"><SkeletonBlock className="h-4 w-32 mb-2 rounded" /><SkeletonBlock className="h-7 w-12 rounded" /></div>
        <div className="card"><SkeletonBlock className="h-4 w-32 mb-2 rounded" /><SkeletonBlock className="h-7 w-12 rounded" /></div>
      </div>
    </div>
  )
}

/** Skeleton cho AlbumDetail page */
export function SkeletonAlbumDetail() {
  return (
    <div className="gallery-container">
      {/* Header: back + album name */}
      <div className="flex items-center gap-3 mb-4">
        <SkeletonBlock className="h-9 w-9 !rounded-lg" />
        <div>
          <SkeletonBlock className="h-7 w-44 mb-1 rounded-lg" />
          <SkeletonBlock className="h-4 w-32 rounded" />
        </div>
        <div className="ml-auto flex items-center gap-4">
          <SkeletonBlock className="h-4 w-16 rounded" />
          <SkeletonBlock className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* View toggle */}
      <div className="flex justify-end mb-6">
        <SkeletonBlock className="h-9 w-32 rounded-lg" />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-12 gap-2 sm:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="col-span-4 sm:col-span-4 md:col-span-3 lg:col-span-3 xl:col-span-2 aspect-square rounded-xl overflow-hidden">
            <SkeletonBlock className="w-full h-full !rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Skeleton cho Mosaic (Dòng thời gian) page */
export function SkeletonMosaic() {
  return (
    <div className="mosaic-page">
      {/* Header */}
      <div className="mosaic-header">
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-5 w-5 !rounded" />
          <SkeletonBlock className="h-7 w-36 rounded-lg" />
        </div>
        <SkeletonBlock className="h-5 w-20 rounded-full" />
      </div>

      {/* Year sections */}
      <div className="mosaic-timeline">
        {[1, 2].map(yr => (
          <div key={yr} className="mosaic-year-section">
            <div className="mosaic-year-header">
              <SkeletonBlock className="h-5 w-5 !rounded" />
              <SkeletonBlock className="h-6 w-16 rounded-lg" />
              <SkeletonBlock className="h-5 w-16 rounded-full" />
            </div>
            <div className="mosaic-month-grid">
              {Array.from({ length: yr === 1 ? 6 : 4 }).map((_, i) => (
                <div key={i} className="mosaic-month-wrapper">
                  <div className="mosaic-month-card" style={{ cursor: 'default' }}>
                    <div className="mosaic-thumb-grid">
                      {[1,2,3,4].map(t => (
                        <SkeletonBlock key={t} className="w-full h-full !rounded-none" />
                      ))}
                    </div>
                    <div className="mosaic-month-info">
                      <SkeletonBlock className="h-4 w-20 rounded" />
                      <SkeletonBlock className="h-3 w-12 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Skeleton cho Map page */
export function SkeletonMap() {
  return (
    <div className="flex flex-col w-full relative" style={{ height: 'calc(100vh - 100px)' }}>
      {/* Stats bar */}
      <div className="flex items-center gap-2 mb-4 px-2">
        <SkeletonBlock className="h-5 w-5 !rounded" />
        <SkeletonBlock className="h-5 w-52 rounded-lg" />
      </div>

      {/* Map placeholder */}
      <div className="flex-1 w-full relative rounded-2xl overflow-hidden border border-outline-variant/20">
        <SkeletonBlock className="w-full h-full !rounded-2xl" />
        {/* Fake map controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-1">
          <SkeletonBlock className="h-8 w-8 !rounded-md" />
          <SkeletonBlock className="h-8 w-8 !rounded-md" />
        </div>
        {/* Center icon hint */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="material-symbols-outlined text-on-surface-variant/20 text-[80px]" data-icon="map">map</span>
        </div>
      </div>
    </div>
  )
}

/** Skeleton cho Admin page */
export function SkeletonAdmin() {
  return (
    <div className="gallery-container">
      {/* Title */}
      <div className="flex items-center gap-2 mb-6">
        <SkeletonBlock className="h-5 w-5 !rounded" />
        <SkeletonBlock className="h-7 w-28 rounded-lg" />
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card flex items-center gap-4">
            <SkeletonBlock className="w-11 h-11 !rounded-lg flex-shrink-0" />
            <div className="flex-1">
              <SkeletonBlock className="h-4 w-16 mb-2 rounded" />
              <SkeletonBlock className="h-7 w-12 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* User table header */}
      <SkeletonBlock className="h-5 w-32 mb-4 rounded-lg" />

      {/* Table skeleton */}
      <div className="card !p-0 overflow-hidden">
        {/* Table header row */}
        <div className="flex gap-4 px-4 py-3 border-b border-outline-variant/20">
          {['w-16', 'w-32', 'w-12', 'w-16', 'w-16'].map((w, i) => (
            <SkeletonBlock key={i} className={`h-4 ${w} rounded`} />
          ))}
        </div>
        {/* Table body rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 items-center px-4 py-3 border-b border-outline-variant/10">
            <SkeletonBlock className="h-4 w-24 rounded" />
            <SkeletonBlock className="h-4 w-40 rounded" />
            <SkeletonBlock className="h-5 w-14 rounded-full" />
            <SkeletonBlock className="h-4 w-16 rounded" />
            <div className="flex gap-2">
              <SkeletonBlock className="h-7 w-7 !rounded" />
              <SkeletonBlock className="h-7 w-7 !rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Skeleton cho SharedLinks page */
export function SkeletonSharedLinks() {
  return (
    <div className="gallery-container">
      {/* Title */}
      <div className="flex items-center gap-2 mb-6">
        <SkeletonBlock className="h-5 w-5 !rounded" />
        <SkeletonBlock className="h-7 w-40 rounded-lg" />
      </div>

      {/* Link cards */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card flex items-center gap-4">
            <SkeletonBlock className="w-11 h-11 !rounded-lg flex-shrink-0" />
            <div className="flex-1">
              <SkeletonBlock className="h-4 w-32 mb-2 rounded" />
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-3 w-20 rounded" />
                <SkeletonBlock className="h-3 w-24 rounded" />
              </div>
            </div>
            <div className="flex gap-2">
              <SkeletonBlock className="h-8 w-24 rounded-lg" />
              <SkeletonBlock className="h-8 w-8 !rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Skeleton cho Settings page */
export function SkeletonSettings() {
  return (
    <div className="gallery-container">
      {/* Title */}
      <div className="flex items-center gap-2 mb-6">
        <SkeletonBlock className="h-5 w-5 !rounded" />
        <SkeletonBlock className="h-7 w-20 rounded-lg" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>

      {/* Form card */}
      <div className="card max-w-lg">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="mb-5">
            <SkeletonBlock className="h-4 w-20 mb-2 rounded" />
            <SkeletonBlock className="h-10 w-full rounded-lg" />
          </div>
        ))}
        <SkeletonBlock className="h-10 w-32 mt-4 rounded-lg" />
      </div>
    </div>
  )
}

export default SkeletonBlock
