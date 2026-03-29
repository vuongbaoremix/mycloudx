import React, { useState } from 'react'
import type { MediaItem } from '../../hooks/useMediaData'
import BlurHashCanvas from './BlurHashCanvas'

type ViewMode = 'timeline' | 'grid-large' | 'grid-medium' | 'grid-small'

interface MediaTileProps {
  item: MediaItem
  viewMode: ViewMode
  idx: number
  isSelected: boolean
  selectionMode: boolean
  onItemClick: (e: React.MouseEvent) => void
  onToggleSelection: (id: string, e: React.MouseEvent) => void
  onToggleFavorite: (id: string, e: React.MouseEvent) => void
  onTouchStart: (id: string, e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: () => void
}

const MediaTile = React.memo(function MediaTile({
  item, viewMode, idx, isSelected, selectionMode,
  onItemClick, onToggleSelection, onToggleFavorite,
  onTouchStart, onTouchMove, onTouchEnd,
}: MediaTileProps) {
  const [imgLoaded, setImgLoaded] = useState(false)

  // Grid columns span logic
  let colSpan = "col-span-4 md:col-span-4 lg:col-span-3 aspect-square"
  if (viewMode === 'timeline') {
    if (idx === 0) {
      colSpan = "col-span-12 md:col-span-6 row-span-2 aspect-[3/2] md:aspect-auto"
    } else if (idx === 1 || idx === 2) {
      colSpan = "col-span-6 md:col-span-3 aspect-square"
    } else {
      colSpan = "col-span-3 md:col-span-3 lg:col-span-2 2xl:col-span-2 aspect-square"
    }
  } else if (viewMode === 'grid-large') {
    colSpan = "col-span-4 sm:col-span-4 md:col-span-4 lg:col-span-4 xl:col-span-3 2xl:col-span-3 aspect-square"
  } else if (viewMode === 'grid-medium') {
    colSpan = "col-span-3 sm:col-span-3 md:col-span-3 lg:col-span-3 xl:col-span-2 2xl:col-span-2 aspect-square"
  } else if (viewMode === 'grid-small') {
    colSpan = "col-span-2 sm:col-span-2 md:col-span-2 lg:col-span-2 xl:col-span-1 2xl:col-span-1 aspect-square"
  }

  const isVideo = item.mime_type?.startsWith('video/')
  const isTimelineHero = viewMode === 'timeline' && idx === 0
  const isTimeline = viewMode === 'timeline'

  // Thumbnail source selection
  let thumbSrc = item.thumbnails?.large || item.thumbnails?.medium || item.thumbnails?.small || item.thumbnails?.micro
  if (viewMode === 'timeline') {
    if (idx === 0) thumbSrc = item.thumbnails?.large || item.thumbnails?.medium
    else thumbSrc = item.thumbnails?.medium
  } else if (viewMode === 'grid-large') {
    thumbSrc = item.thumbnails?.medium || item.thumbnails?.small || item.thumbnails?.micro
  } else if (viewMode === 'grid-small') {
    thumbSrc = item.thumbnails?.small || item.thumbnails?.micro
  } else if (viewMode === 'grid-medium') {
    thumbSrc = item.thumbnails?.medium || item.thumbnails?.small || item.thumbnails?.micro
  }

  if (!thumbSrc && isVideo) thumbSrc = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiPjwvc3ZnPg=='
  if (item._previewUrl) thumbSrc = item._previewUrl

  return (
    <div
      data-media-id={item.id}
      className={`${colSpan} relative group ${isTimelineHero ? 'rounded-none md:rounded-2xl timeline-hero-parallax' : 'rounded-none md:rounded-xl'} overflow-hidden cursor-pointer bg-surface-container-high shadow-none md:shadow-xl md:shadow-on-surface/5 transition-all ${isTimeline ? 'timeline-tile timeline-tile-glow' : ''} ${selectionMode && isSelected ? 'ring-2 md:ring-4 ring-primary ring-inset scale-[0.98]' : ''}`}
      onClick={onItemClick}
      onTouchStart={(e) => onTouchStart(item.id, e)}
      onTouchMove={(e) => onTouchMove(e)}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* Layer 1: BlurHash canvas (shows immediately when mounted) */}
      {item.blur_hash && !imgLoaded && (
        <BlurHashCanvas
          hash={item.blur_hash}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Layer 2: Skeleton shimmer (only when no blurhash) */}
      {!item.blur_hash && !imgLoaded && (
        <div className="absolute inset-0 skeleton-shimmer bg-surface-container" />
      )}

      {/* Layer 3: Actual image (fade-in when loaded) */}
      <img
        className={`w-full h-full object-cover transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${(selectionMode && isSelected) || !selectionMode ? 'group-hover:scale-105' : ''}`}
        src={thumbSrc || ''}
        alt={item.original_name}
        loading="lazy"
        style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.4s cubic-bezier(0.4,0,0.2,1)' }}
        onLoad={() => setImgLoaded(true)}
      />

      {/* Overlay gradient */}
      <div className={`absolute inset-0 transition-opacity ${isTimelineHero ? 'timeline-hero-overlay opacity-100' : `bg-gradient-to-t from-on-background/60 via-transparent to-transparent ${selectionMode && isSelected ? 'opacity-30' : 'opacity-0 group-hover:opacity-100'}`}`}></div>

      {/* Selection Checkmark */}
      <div
        className={`absolute top-1 left-1 md:top-4 md:left-4 z-20 transition-all ${selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelection(item.id, e)
        }}
      >
        <div className={`h-5 w-5 md:h-6 md:w-6 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer ${isSelected ? 'bg-primary border-primary text-white scale-110' : 'border-white/80 bg-black/20 text-transparent hover:border-white hover:bg-black/40'}`}>
          <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
        </div>
      </div>

      {/* Favorite button */}
      <div
        className="absolute top-1 right-1 md:top-4 md:right-4 opacity-0 group-hover:opacity-100 transition-all transform -translate-y-2 group-hover:translate-y-0 cursor-pointer p-1 md:p-2 -m-1 md:-m-2"
        onClick={(e) => onToggleFavorite(item.id, e)}
      >
        <span
          className="material-symbols-outlined drop-shadow-md"
          data-icon="favorite"
          style={{
            color: item.is_favorite ? 'var(--warning, #f59e0b)' : 'white',
            fontVariationSettings: item.is_favorite ? "'FILL' 1" : "'FILL' 0"
          }}
        >
          favorite
        </span>
      </div>

      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-on-background/20 transition-all">
          <span className="material-symbols-outlined text-white text-5xl" data-icon="play_circle">play_circle</span>
        </div>
      )}

      {/* Info texts */}
      {viewMode === 'timeline' && isTimelineHero ? (
        <div className="absolute bottom-0 left-0 right-0 p-3 md:p-6 pointer-events-none text-white">
          <div className="flex items-center gap-1.5 mb-1 md:mb-2">
            <span className="material-symbols-outlined text-[12px] md:text-[16px] text-white/70" data-icon={isVideo ? 'videocam' : 'photo_camera'}>{isVideo ? 'videocam' : 'photo_camera'}</span>
            <span className="text-[10px] md:text-xs font-medium text-white/70 uppercase tracking-wider">{isVideo ? 'Video' : 'Ảnh'}</span>
          </div>
          <p className="font-bold text-sm md:text-2xl truncate max-w-[500px]">{item.original_name}</p>
          <p className="text-xs md:text-sm opacity-80 mt-0.5 flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px] md:text-[14px]" data-icon="schedule">schedule</span>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      ) : viewMode === 'timeline' && idx >= 3 ? null : viewMode !== 'grid-small' && (
        <div className={`absolute pointer-events-none text-white transform translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all ${viewMode === 'grid-medium' ? 'bottom-3 left-3' : 'bottom-6 left-6'}`}>
          <p className={`font-bold truncate max-w-[200px] ${viewMode === 'grid-medium' ? 'text-sm' : 'text-lg'}`}>{item.original_name}</p>
          <p className={`opacity-80 ${viewMode === 'grid-medium' ? 'text-xs' : 'text-sm'}`}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      )}
    </div>
  )
}, (prev, next) => {
  return prev.item.id === next.item.id
    && prev.isSelected === next.isSelected
    && prev.selectionMode === next.selectionMode
    && prev.item.is_favorite === next.item.is_favorite
    && prev.item.status === next.item.status
    && prev.item._previewUrl === next.item._previewUrl
    && prev.viewMode === next.viewMode
    && prev.idx === next.idx
})

export default MediaTile
