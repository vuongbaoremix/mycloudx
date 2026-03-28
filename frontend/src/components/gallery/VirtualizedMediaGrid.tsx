import { useMemo, useRef, useCallback, useEffect, useState, useLayoutEffect } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { MediaItem } from '../../hooks/useMediaData'
import MediaTile from './MediaTile'

type ViewMode = 'timeline' | 'grid-large' | 'grid-medium' | 'grid-small'

interface GroupedMedia {
  [label: string]: { dateKey: string; items: MediaItem[] }
}

interface VirtualizedMediaGridProps {
  media: MediaItem[]
  groupedMedia: GroupedMedia
  viewMode: ViewMode
  selectedItems: Set<string>
  selectionMode: boolean
  totalItems: number
  hasMore: boolean
  onLoadMore: () => void
  onItemClick: (globalIndex: number, itemId: string, e: React.MouseEvent) => void
  onToggleSelection: (id: string, e: React.MouseEvent) => void
  onToggleFavorite: (id: string, e: React.MouseEvent) => void
  onToggleGroupSelection: (groupItems: MediaItem[]) => void
  onTouchStart: (id: string, e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: () => void
}

// Determine columns per row based on viewMode
function getColumnsPerRow(viewMode: ViewMode): number {
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1200
  const isMobile = screenWidth < 768
  const isLg = screenWidth >= 1024
  const isXl = screenWidth >= 1280

  if (viewMode === 'timeline') {
    if (isMobile) return 4
    if (isLg) return 6
    return 4
  } else if (viewMode === 'grid-large') {
    if (isMobile) return 3
    if (isXl) return 4
    return 3
  } else if (viewMode === 'grid-medium') {
    if (isMobile) return 4
    if (isXl) return 6
    return 4
  } else if (viewMode === 'grid-small') {
    if (isMobile) return 6
    if (isXl) return 12
    return 6
  }
  return 4
}

type VirtualRow =
  | { type: 'header'; label: string; dateKey: string; items: MediaItem[]; sectionIdx: number }
  | { type: 'media-row'; items: MediaItem[]; groupLabel: string; startIdx: number }
  | { type: 'skeleton-header' }
  | { type: 'skeleton-row'; count: number }

export default function VirtualizedMediaGrid({
  media, groupedMedia, viewMode, selectedItems, selectionMode, totalItems,
  hasMore, onLoadMore,
  onItemClick, onToggleSelection, onToggleFavorite, onToggleGroupSelection,
  onTouchStart, onTouchMove, onTouchEnd,
}: VirtualizedMediaGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [columnsPerRow, setColumnsPerRow] = useState(() => getColumnsPerRow(viewMode))

  // Measure actual container width via ResizeObserver (fixes first-load jank)
  const [containerWidth, setContainerWidth] = useState(0)
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    // Initial measurement
    setContainerWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Update columns on resize
  useEffect(() => {
    const handleResize = () => setColumnsPerRow(getColumnsPerRow(viewMode))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [viewMode])

  useEffect(() => {
    setColumnsPerRow(getColumnsPerRow(viewMode))
  }, [viewMode])

  // Build flat list of virtual rows
  const virtualRows = useMemo(() => {
    const rows: VirtualRow[] = []
    const entries = Object.entries(groupedMedia)

    entries.forEach(([label, group], sectionIdx) => {
      rows.push({ type: 'header', label, dateKey: group.dateKey, items: group.items, sectionIdx })

      if (viewMode === 'timeline') {
        if (group.items.length > 0) {
          const heroRow = group.items.slice(0, 3)
          rows.push({ type: 'media-row', items: heroRow, groupLabel: label, startIdx: 0 })
        }
        const remaining = group.items.slice(3)
        for (let i = 0; i < remaining.length; i += columnsPerRow) {
          const chunk = remaining.slice(i, i + columnsPerRow)
          rows.push({ type: 'media-row', items: chunk, groupLabel: label, startIdx: 3 + i })
        }
      } else {
        for (let i = 0; i < group.items.length; i += columnsPerRow) {
          const chunk = group.items.slice(i, i + columnsPerRow)
          rows.push({ type: 'media-row', items: chunk, groupLabel: label, startIdx: i })
        }
      }
    })

    // Add skeleton placeholders for remaining items
    if (totalItems > 0 && media.length < totalItems) {
      rows.push({ type: 'skeleton-header' })
      const remainingCount = Math.min(totalItems - media.length, 24)
      const skeletonRows = Math.ceil(remainingCount / columnsPerRow)
      for (let i = 0; i < skeletonRows; i++) {
        const count = Math.min(columnsPerRow, remainingCount - i * columnsPerRow)
        rows.push({ type: 'skeleton-row', count })
      }
    }

    return rows
  }, [groupedMedia, viewMode, columnsPerRow, totalItems, media.length])

  // Compute the gap in pixels
  const gapPx = useMemo(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    if (isMobile) return 1
    if (viewMode === 'timeline') return 12
    if (viewMode === 'grid-large') return 24
    if (viewMode === 'grid-medium') return 16
    return 8
  }, [viewMode])

  // Estimate row heights using measured container width
  const estimateSize = useCallback((index: number) => {
    const row = virtualRows[index]
    if (!row) return 200

    if (row.type === 'header' || row.type === 'skeleton-header') {
      return typeof window !== 'undefined' && window.innerWidth < 768 ? 36 : 52
    }

    const width = containerWidth || 800
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    const totalHGap = (columnsPerRow - 1) * gapPx

    if (row.type === 'skeleton-row') {
      const tileSize = (width - totalHGap) / columnsPerRow
      return tileSize + gapPx
    }

    if (viewMode === 'timeline' && row.type === 'media-row' && row.startIdx === 0) {
      const heroHeight = isMobile ? width * 0.67 : width / 2
      return heroHeight + gapPx
    }

    const tileSize = (width - totalHGap) / columnsPerRow
    return tileSize + gapPx
  }, [virtualRows, viewMode, columnsPerRow, gapPx, containerWidth])

  // Window virtualizer — uses window scroll, no internal scroll container
  const virtualizer = useWindowVirtualizer({
    count: virtualRows.length,
    estimateSize,
    overscan: 5,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
  })

  // Re-measure when container width changes
  useEffect(() => {
    if (containerWidth > 0) {
      virtualizer.measure()
    }
  }, [containerWidth, virtualizer])

  // Lazy load: trigger onLoadMore when scrolled near the end
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current
    if (!sentinel || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore()
        }
      },
      { rootMargin: '500px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore])

  const gridGap = viewMode === 'timeline' ? 'gap-px md:gap-3'
    : viewMode === 'grid-large' ? 'gap-px md:gap-6'
      : viewMode === 'grid-medium' ? 'gap-px md:gap-4'
        : 'gap-px md:gap-2'

  // ─── Floating sticky header logic (window scroll) ───
  const headerIndices = useMemo(() =>
    virtualRows.map((r, i) => (r.type === 'header' ? i : -1)).filter(i => i >= 0),
    [virtualRows]
  )

  const [stickyHeader, setStickyHeader] = useState<{ row: Extract<VirtualRow, { type: 'header' }>; translateY: number } | null>(null)

  const handleScroll = useCallback(() => {
    if (headerIndices.length === 0) { setStickyHeader(null); return }

    const containerTop = containerRef.current?.offsetTop ?? 0
    const headerOffset = typeof window !== 'undefined' && window.innerWidth < 768 ? 48 : 64
    const scrollTop = window.scrollY - containerTop + headerOffset
    const headerHeight = typeof window !== 'undefined' && window.innerWidth < 768 ? 36 : 52

    let activeIdx = -1
    for (let i = headerIndices.length - 1; i >= 0; i--) {
      const hStart = virtualizer.getOffsetForIndex(headerIndices[i], 'start')?.[0] ?? 0
      if (hStart <= scrollTop) { activeIdx = i; break }
    }

    if (activeIdx < 0) { setStickyHeader(null); return }

    const activeRow = virtualRows[headerIndices[activeIdx]] as Extract<VirtualRow, { type: 'header' }>

    let translateY = 0
    if (activeIdx + 1 < headerIndices.length) {
      const nextStart = virtualizer.getOffsetForIndex(headerIndices[activeIdx + 1], 'start')?.[0] ?? Infinity
      const diff = nextStart - scrollTop - headerHeight
      if (diff < 0) translateY = diff
    }

    setStickyHeader({ row: activeRow, translateY })
  }, [headerIndices, virtualRows, virtualizer])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const items = virtualizer.getVirtualItems()

  return (
    <div
      ref={containerRef}
      className={`${viewMode === 'timeline' ? 'timeline-connector' : ''}`}
    >
      {/* Floating sticky header overlay */}
      {stickyHeader && (
        <div
          className="sticky-header-overlay"
          style={{
            position: 'fixed',
            top: typeof window !== 'undefined' && window.innerWidth < 768 ? 48 : 64,
            left: containerRef.current?.getBoundingClientRect().left ?? 0,
            right: 0,
            zIndex: 20,
            transform: `translateY(${stickyHeader.translateY}px)`,
            pointerEvents: 'auto',
            padding: "0 10px"
          }}
        >
          <div className={`flex items-center gap-2 md:gap-4 py-2 md:py-3 px-2 md:px-0 bg-surface/95 backdrop-blur-sm border-b border-outline-variant/20 shadow-sm ${viewMode === 'timeline' ? 'timeline-dot' + (stickyHeader.row.sectionIdx === 0 ? ' timeline-dot-active' : '') : ''}`}>
            {viewMode === 'timeline' && (
              <span className="material-symbols-outlined text-primary text-[14px] md:text-[20px]" data-icon="calendar_today">calendar_today</span>
            )}
            <h3 className="text-sm md:text-2xl font-bold font-headline text-on-surface">{stickyHeader.row.label}</h3>
            <div className="h-px flex-1 bg-surface-container"></div>
            {(stickyHeader.row.label === 'Hôm nay' || stickyHeader.row.label === 'Hôm qua') ? (
              <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-on-surface-variant bg-surface-container-high px-2 md:px-3 py-0.5 md:py-1 rounded-full">{stickyHeader.row.dateKey}</span>
            ) : null}
            {viewMode === 'timeline' && (
              <span className="text-[10px] md:text-xs font-medium text-on-surface-variant bg-primary/10 text-primary px-2 md:px-3 py-0.5 md:py-1 rounded-full">{stickyHeader.row.items.length} ảnh</span>
            )}
            <button
              onClick={() => onToggleGroupSelection(stickyHeader.row.items)}
              className={`group-select-btn p-1.5 rounded-full transition-all ${selectionMode ? 'opacity-100' : 'opacity-0 hover:opacity-100'} ${stickyHeader.row.items.every(item => selectedItems.has(item.id))
                  ? 'bg-primary text-white'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-primary/20 hover:text-primary'
                }`}
              title={stickyHeader.row.items.every(item => selectedItems.has(item.id)) ? 'Bỏ chọn nhóm' : 'Chọn cả nhóm'}
            >
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: stickyHeader.row.items.every(item => selectedItems.has(item.id)) ? "'FILL' 1" : "'FILL' 0" }}>
                {stickyHeader.row.items.every(item => selectedItems.has(item.id)) ? 'check_circle' : 'select_all'}
              </span>
            </button>
          </div>
        </div>
      )}
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {items.map((virtualRow) => {
          const row = virtualRows[virtualRow.index]

          if (row.type === 'header') {
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                }}
              >
                <div className={`flex items-center gap-2 md:gap-4 py-2 md:py-3 ${viewMode === 'timeline' ? 'timeline-dot' + (row.sectionIdx === 0 ? ' timeline-dot-active' : '') : ''}`}>
                  {viewMode === 'timeline' && (
                    <span className="material-symbols-outlined text-primary text-[14px] md:text-[20px]" data-icon="calendar_today">calendar_today</span>
                  )}
                  <h3 className="text-sm md:text-2xl font-bold font-headline text-on-surface">{row.label}</h3>
                  <div className="h-px flex-1 bg-surface-container"></div>
                  {(row.label === 'Hôm nay' || row.label === 'Hôm qua') ? (
                    <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-on-surface-variant bg-surface-container-high px-2 md:px-3 py-0.5 md:py-1 rounded-full">{row.dateKey}</span>
                  ) : null}
                  {viewMode === 'timeline' && (
                    <span className="text-[10px] md:text-xs font-medium text-on-surface-variant bg-primary/10 text-primary px-2 md:px-3 py-0.5 md:py-1 rounded-full">{row.items.length} ảnh</span>
                  )}
                  <button
                    onClick={() => onToggleGroupSelection(row.items)}
                    className={`group-select-btn p-1.5 rounded-full transition-all ${selectionMode ? 'opacity-100' : 'opacity-0 hover:opacity-100'} ${row.items.every(item => selectedItems.has(item.id))
                        ? 'bg-primary text-white'
                        : 'bg-surface-container-high text-on-surface-variant hover:bg-primary/20 hover:text-primary'
                      }`}
                    title={row.items.every(item => selectedItems.has(item.id)) ? 'Bỏ chọn nhóm' : 'Chọn cả nhóm'}
                  >
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: row.items.every(item => selectedItems.has(item.id)) ? "'FILL' 1" : "'FILL' 0" }}>
                      {row.items.every(item => selectedItems.has(item.id)) ? 'check_circle' : 'select_all'}
                    </span>
                  </button>
                </div>
              </div>
            )
          }

          if (row.type === 'media-row') {
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                }}
              >
                <div className={`grid grid-cols-12 ${gridGap}`} style={{ paddingBottom: `${gapPx}px` }}>
                  {row.items.map((item, localIdx) => {
                    const idx = row.startIdx + localIdx
                    const globalIndex = media.findIndex(m => m.id === item.id)
                    const isSelected = selectedItems.has(item.id)

                    return (
                      <MediaTile
                        key={item.id}
                        item={item}
                        viewMode={viewMode}
                        idx={idx}
                        isSelected={isSelected}
                        selectionMode={selectionMode}
                        onItemClick={(e) => onItemClick(globalIndex, item.id, e)}
                        onToggleSelection={onToggleSelection}
                        onToggleFavorite={onToggleFavorite}
                        onTouchStart={onTouchStart}
                        onTouchMove={onTouchMove}
                        onTouchEnd={onTouchEnd}
                      />
                    )
                  })}
                </div>
              </div>
            )
          }

          if (row.type === 'skeleton-header') {
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                }}
              >
                <div className="flex items-center gap-2 md:gap-4 mb-1.5 md:mb-4 mt-3 md:mt-16">
                  <div className="skeleton-shimmer h-4 md:h-7 w-28 md:w-44 rounded-lg bg-surface-container"></div>
                  <div className="h-px flex-1 bg-surface-container"></div>
                  <div className="skeleton-shimmer h-4 md:h-6 w-16 md:w-20 rounded-full bg-surface-container"></div>
                </div>
              </div>
            )
          }

          if (row.type === 'skeleton-row') {
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                }}
              >
                <div className={`grid grid-cols-12 gap-px md:gap-3`}>
                  {Array.from({ length: row.count }).map((_, i) => (
                    <div key={`skel-${i}`} className="col-span-4 md:col-span-4 lg:col-span-3 aspect-square rounded-none md:rounded-xl overflow-hidden">
                      <div className="skeleton-shimmer w-full h-full bg-surface-container"></div>
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          return null
        })}
      </div>

      {/* Lazy load sentinel — triggers onLoadMore when scrolled into view */}
      {hasMore && (
        <div ref={loadMoreSentinelRef} className="w-full h-4" />
      )}
    </div>
  )
}
