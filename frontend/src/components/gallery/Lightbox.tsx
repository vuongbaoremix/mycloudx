import { useEffect, useLayoutEffect, useCallback, useState, useRef, useMemo } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Heart,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FlipHorizontal,
  MapPin,
  Download,
  Info
} from 'lucide-react'
import VideoPlayer from './VideoPlayer'

interface MediaItem {
  id: string
  original_name: string
  mime_type: string
  size?: number
  width?: number
  height?: number
  thumbnails: { large?: string; medium?: string; small?: string; micro?: string }
  is_favorite: boolean
  storage_path: string
  created_at: string
  status?: string
  _previewUrl?: string
  metadata?: {
    camera_make?: string
    camera_model?: string
    exif?: Record<string, any>
    location?: { lat: number; lng: number }
  }
}

interface LightboxProps {
  media: MediaItem[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
  onFavorite: (id: string) => void
  onDelete?: (id: string) => void
}

function getMediaSrc(item: MediaItem) {
  if (item._previewUrl) return item._previewUrl
  return `/api/media/serve/${encodeURIComponent(item.storage_path)}`
}

function getThumbSrc(item: MediaItem) {
  return item.thumbnails?.small || item.thumbnails?.micro || item.thumbnails?.medium || ''
}

// ========== THUMBNAIL STRIP ==========
function ThumbnailStrip({
  media,
  currentIndex,
  onNavigate,
}: {
  media: MediaItem[]
  currentIndex: number
  onNavigate: (index: number) => void
}) {
  const stripRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to keep current thumb visible
  useEffect(() => {
    if (!stripRef.current) return
    const thumb = stripRef.current.children[currentIndex] as HTMLElement
    if (thumb) {
      thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [currentIndex])

  // Limit visible range for performance (show ±30 around current)
  const visibleRange = useMemo(() => {
    const start = Math.max(0, currentIndex - 30)
    const end = Math.min(media.length, currentIndex + 31)
    return { start, end }
  }, [currentIndex, media.length])

  return (
    <div className="absolute bottom-2 md:bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-[90vw] md:max-w-[70vw]">
      <div
        ref={stripRef}
        className="flex gap-1.5 overflow-x-auto hide-scrollbar py-1.5 px-2 bg-black/40 backdrop-blur-xl rounded-xl"
        style={{ scrollbarWidth: 'none' }}
      >
        {/* Spacer for items before visible range */}
        {visibleRange.start > 0 && (
          <div style={{ minWidth: visibleRange.start * 52, flexShrink: 0 }} />
        )}
        {media.slice(visibleRange.start, visibleRange.end).map((item, i) => {
          const realIndex = visibleRange.start + i
          const isActive = realIndex === currentIndex
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(realIndex)}
              className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden transition-all duration-200 border-2 ${isActive
                ? 'border-white scale-110 shadow-lg shadow-white/20'
                : 'border-transparent opacity-50 hover:opacity-80 hover:border-white/30'
                }`}
            >
              <img
                src={getThumbSrc(item)}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
                draggable={false}
              />
            </button>
          )
        })}
        {/* Spacer for items after visible range */}
        {visibleRange.end < media.length && (
          <div style={{ minWidth: (media.length - visibleRange.end) * 52, flexShrink: 0 }} />
        )}
      </div>
    </div>
  )
}

// ========== PROGRESSIVE IMAGE (dual-img crossfade: thumbnail stays visible, full-res fades in on top) ==========
function ProgressiveImage({
  fastSrc,
  fullSrc,
  alt,
  className,
  draggable,
}: {
  fastSrc: string
  fullSrc: string
  alt: string
  className?: string
  draggable?: boolean
}) {
  const [fullLoaded, setFullLoaded] = useState(false)
  const prevFullSrc = useRef(fullSrc)

  // Reset loaded state when image changes
  useEffect(() => {
    if (fullSrc !== prevFullSrc.current) {
      setFullLoaded(false)
      prevFullSrc.current = fullSrc
    }
  }, [fullSrc])

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Base: thumbnail (always visible) */}
      {fastSrc && (
        <img
          src={fastSrc}
          alt={alt}
          className={className}
          draggable={draggable}
        />
      )}
      {/* Overlay: full-res with fade-in */}
      <img
        src={fullSrc}
        alt={alt}
        className={`${className} ${fastSrc ? 'absolute inset-0 w-full h-full' : ''}`}
        style={{
          opacity: fastSrc ? (fullLoaded ? 1 : 0) : 1,
          transition: 'opacity 0.4s ease',
        }}
        draggable={draggable}
        onLoad={() => setFullLoaded(true)}
      />
    </div>
  )
}

// ========== MAIN LIGHTBOX ==========
export default function Lightbox({
  media,
  currentIndex,
  onClose,
  onNavigate,
  onFavorite,
}: LightboxProps) {
  const current = media[currentIndex]
  const [showMetadata, setShowMetadata] = useState(false)

  // Zoom & transform state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)
  const [flip, setFlip] = useState(false)

  // Swipe state
  const [dragOffset, setDragOffset] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const isAnimatingRef = useRef(false)

  // Pinch state
  const [initialPinchDist, setInitialPinchDist] = useState<number | null>(null)
  const [initialPinchZoom, setInitialPinchZoom] = useState(1)
  const [touchPanStart, setTouchPanStart] = useState<{ x: number; y: number } | null>(null)
  const [initialPan, setInitialPan] = useState({ x: 0, y: 0 })
  const [lastTap, setLastTap] = useState(0)

  // Reset on image change — useLayoutEffect prevents flicker
  // (runs synchronously before browser paint)
  useLayoutEffect(() => {
    isAnimatingRef.current = true
    setDragOffset(0)
    setIsSwiping(false)
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setRotation(0)
    setFlip(false)
    // Re-enable transitions after browser has painted the new image
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isAnimatingRef.current = false
      })
    })
  }, [currentIndex])

  // Keyboard
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && currentIndex > 0) onNavigate(currentIndex - 1)
      if (e.key === 'ArrowRight' && currentIndex < media.length - 1) onNavigate(currentIndex + 1)
    },
    [currentIndex, media.length, onClose, onNavigate]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  // Preload adjacent images
  useEffect(() => {
    ;[-2, -1, 1, 2].forEach(offset => {
      const idx = currentIndex + offset
      if (idx >= 0 && idx < media.length) {
        const item = media[idx]
        const src = item.thumbnails?.large || item.thumbnails?.medium || getMediaSrc(item)
        if (src) { const img = new Image(); img.src = src }
      }
    })
  }, [currentIndex, media])

  // ====== SWIPE HANDLING (touch-based, manual for max control) ======
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const containerWidth = containerRef.current?.offsetWidth || (typeof window !== 'undefined' ? window.innerWidth : 800)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      setInitialPinchDist(dist)
      setInitialPinchZoom(zoom)
      touchStartRef.current = null
      return
    }

    if (zoom > 1) {
      // Pan mode when zoomed
      setTouchPanStart({ x: e.touches[0].clientX, y: e.touches[0].clientY })
      setInitialPan({ ...pan })
      return
    }

    // Swipe start
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    }
    setIsSwiping(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDist !== null) {
      // Pinch zoom
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const scale = dist / initialPinchDist
      const newZoom = Math.min(Math.max(1, initialPinchZoom * scale), 5)
      setZoom(newZoom)
      if (newZoom === 1) setPan({ x: 0, y: 0 })
      return
    }

    if (zoom > 1 && touchPanStart) {
      // Pan when zoomed
      const dx = e.touches[0].clientX - touchPanStart.x
      const dy = e.touches[0].clientY - touchPanStart.y
      setPan({ x: initialPan.x + dx, y: initialPan.y + dy })
      return
    }

    // Swipe — move images with finger
    if (!touchStartRef.current || e.touches.length !== 1) return
    const dx = e.touches[0].clientX - touchStartRef.current.x
    const dy = e.touches[0].clientY - touchStartRef.current.y

    // Only register horizontal swipe if horizontal movement > vertical
    if (Math.abs(dx) > Math.abs(dy) * 0.7) {
      // Add resistance at edges
      let offset = dx
      if ((currentIndex === 0 && dx > 0) || (currentIndex === media.length - 1 && dx < 0)) {
        offset = dx * 0.3 // Rubber band effect at edges
      }
      setDragOffset(offset)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Double-tap zoom
    const now = Date.now()
    if (e.touches.length === 0 && e.changedTouches.length === 1 && !isSwiping) {
      // This was a tap, not a swipe
    }
    if (e.touches.length === 0 && e.changedTouches.length === 1) {
      const wasMoved = Math.abs(dragOffset) > 5
      if (!wasMoved && now - lastTap < 300) {
        // Double tap
        if (zoom > 1) {
          setZoom(1)
          setPan({ x: 0, y: 0 })
        } else {
          setZoom(2.5)
        }
        setLastTap(0)
        setDragOffset(0)
        setIsSwiping(false)
        touchStartRef.current = null
        return
      }
      setLastTap(now)
    }

    setInitialPinchDist(null)
    setTouchPanStart(null)

    // Swipe end — determine if we should navigate
    if (touchStartRef.current && zoom <= 1) {
      const velocity = touchStartRef.current
        ? Math.abs(dragOffset) / Math.max(1, (Date.now() - touchStartRef.current.time)) * 1000
        : 0
      const threshold = containerWidth * 0.15

      if (dragOffset < -threshold || (dragOffset < -30 && velocity > 300)) {
        // Swipe left → next
        if (currentIndex < media.length - 1) {
          // Animate out to left then navigate
          animateAndNavigate(currentIndex + 1, -containerWidth)
          touchStartRef.current = null
          return
        }
      } else if (dragOffset > threshold || (dragOffset > 30 && velocity > 300)) {
        // Swipe right → previous
        if (currentIndex > 0) {
          animateAndNavigate(currentIndex - 1, containerWidth)
          touchStartRef.current = null
          return
        }
      }
    }

    // Snap back
    setDragOffset(0)
    setIsSwiping(false)
    touchStartRef.current = null
  }

  const animateAndNavigate = (newIndex: number, direction: number) => {
    // Step 1: Enable CSS transition and slide image off-screen
    setIsSwiping(false)
    setDragOffset(direction)

    // Step 2: After slide-out animation completes, navigate
    // useLayoutEffect on [currentIndex] will handle the instant reset
    setTimeout(() => {
      onNavigate(newIndex)
    }, 300)
  }

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY * -0.005
    const newZoom = Math.min(Math.max(1, zoom + delta), 5)
    setZoom(newZoom)
    if (newZoom === 1) setPan({ x: 0, y: 0 })
  }

  // Mouse drag for desktop
  const handleMouseDragDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      e.preventDefault()
      const startX = e.clientX - pan.x
      const startY = e.clientY - pan.y
      const move = (ev: MouseEvent) => setPan({ x: ev.clientX - startX, y: ev.clientY - startY })
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    }
  }

  if (!current) return null

  const isZoomed = zoom > 1
  const prev = currentIndex > 0 ? media[currentIndex - 1] : null
  const next = currentIndex < media.length - 1 ? media[currentIndex + 1] : null
  const sizeClass = showMetadata ? 'max-w-[75vw] max-h-[70vh]' : 'max-w-[95vw] max-h-[80vh]'

  // Metadata helpers
  const formatSize = (bytes?: number) => {
    if (!bytes) return 'Không rõ'
    const mb = bytes / (1024 * 1024)
    if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`
    return `${mb.toFixed(1)} MB`
  }
  const exifDate = current.metadata?.exif?.DateTimeOriginal || current.created_at
  const dateObj = new Date(exifDate)
  const formattedDate = dateObj.toLocaleDateString('vi-VN', { month: 'long', day: 'numeric', year: 'numeric' })
  const formattedTime = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  const cameraModel = current.metadata?.camera_model || current.metadata?.camera_make || 'Không rõ'
  const exif = current.metadata?.exif || {}
  const aperture = exif.FNumber ? `f/${Number(exif.FNumber).toFixed(1)}` : '-'
  const iso = exif.ISOSpeedRatings ? `ISO ${exif.ISOSpeedRatings}` : '-'
  const exposure = exif.ExposureTime ? `${exif.ExposureTime}s` : '-'
  const hasLocation = !!current.metadata?.location

  return (
    <div className="fixed inset-0 z-[100] flex font-body">
      {/* Photo Viewer Area */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-gradient-to-br from-[#0f172a] to-[#020617] overflow-hidden touch-none select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        onMouseDown={handleMouseDragDown}
      >
        {/* ===== SWIPE CAROUSEL ===== */}
        {!isZoomed && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translateX(${dragOffset}px)`,
              transition: (isSwiping || isAnimatingRef.current) ? 'none' : 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
            }}
          >
            {/* Previous image — to the left */}
            {prev && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ transform: `translateX(-100%)` }}
              >
                <img
                  src={prev.thumbnails?.large || prev.thumbnails?.medium || getMediaSrc(prev)}
                  alt={prev.original_name}
                  className={`object-contain ${sizeClass} pointer-events-none`}
                  draggable={false}
                />
              </div>
            )}

            {/* Current image — CSS crossfade (no AnimatePresence delay) */}
            <div
              key={current.id}
              className="flex items-center justify-center w-full h-full"
              style={{
                transform: `scaleX(${flip ? -1 : 1}) rotate(${rotation}deg)`,
                transition: 'transform 0.3s ease',
              }}
            >
              {current.mime_type.startsWith('video/') ? (
                <VideoPlayer
                  src={`/api/media/serve/${encodeURIComponent(current.storage_path)}`}
                  poster={current.thumbnails?.large || current.thumbnails?.medium}
                  className={`drop-shadow-[0_25px_50px_rgba(0,0,0,0.5)] ${sizeClass}`}
                />
              ) : (
                <ProgressiveImage
                  key={`img-${current.id}`}
                  fastSrc={current.thumbnails?.large || current.thumbnails?.medium || ''}
                  fullSrc={getMediaSrc(current)}
                  alt={current.original_name}
                  className={`object-contain drop-shadow-[0_25px_50px_rgba(0,0,0,0.5)] ${sizeClass} pointer-events-none`}
                  draggable={false}
                />
              )}
            </div>

            {/* Next image — to the right */}
            {next && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ transform: `translateX(100%)` }}
              >
                <img
                  src={next.thumbnails?.large || next.thumbnails?.medium || getMediaSrc(next)}
                  alt={next.original_name}
                  className={`object-contain ${sizeClass} pointer-events-none`}
                  draggable={false}
                />
              </div>
            )}
          </div>
        )}

        {/* ===== ZOOMED VIEW ===== */}
        {isZoomed && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) scaleX(${flip ? -1 : 1}) rotate(${rotation}deg)`,
              cursor: 'grab',
            }}
          >
            <img
              src={getMediaSrc(current)}
              alt={current.original_name}
              draggable={false}
              className={`object-contain drop-shadow-[0_25px_50px_rgba(0,0,0,0.5)] ${sizeClass} pointer-events-none`}
            />
          </div>
        )}

        {/* ===== TOP UI ===== */}
        {/* Counter */}
        <div className="absolute top-4 left-4 md:top-6 md:left-6 z-30">
          <span className="text-white/60 text-sm font-medium bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/5">
            {currentIndex + 1} / {media.length}
          </span>
        </div>

        {/* Info + Close */}
        <div className="absolute top-4 right-4 md:top-6 md:right-6 flex items-center gap-3 z-30">
          <button
            className={`w-11 h-11 flex items-center justify-center rounded-full transition-all backdrop-blur-xl border shadow-lg ${showMetadata ? 'bg-primary text-white border-primary/30' : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white border-white/5'}`}
            onClick={(e) => { e.stopPropagation(); setShowMetadata(!showMetadata) }}
            title="Chi tiết ảnh"
          >
            <Info size={20} />
          </button>
          <button
            className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-error-container text-white/80 hover:text-error transition-all backdrop-blur-xl border border-white/5 shadow-lg"
            onClick={(e) => { e.stopPropagation(); onClose() }}
            title="Đóng"
          >
            <X size={20} />
          </button>
        </div>

        {/* ===== TOP TOOLBAR ===== */}
        <div className="absolute bottom-[5.5rem] md:bottom-auto md:top-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 md:gap-2 bg-white/10 hover:bg-white/15 transition-colors backdrop-blur-xl px-3 md:px-4 py-1.5 md:py-2 rounded-full border border-white/5 z-30 shadow-lg">
          <button className="p-2 text-white/80 hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(1, z - 0.5)) }}>
            <ZoomOut size={20} />
          </button>
          <button className="p-2 text-white/80 hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(5, z + 0.5)) }}>
            <ZoomIn size={20} />
          </button>
          <div className="w-px h-6 bg-white/20 mx-1"></div>
          <button className="p-2 text-white/80 hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); setRotation(r => r + 90) }}>
            <RotateCw size={20} />
          </button>
          <button className="p-2 text-white/80 hover:text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); setFlip(f => !f) }}>
            <FlipHorizontal size={20} />
          </button>
          <div className="w-px h-6 bg-white/20 mx-1"></div>
          <a href={`/api/media/${current.id}/download`} download
            className="p-2 text-white/80 hover:text-white transition-colors">
            <Download size={20} />
          </a>
          <button className="p-2 transition-colors ml-1" onClick={() => onFavorite(current.id)}>
            <Heart size={20} fill={current.is_favorite ? '#f59e0b' : 'none'} color={current.is_favorite ? '#f59e0b' : 'white'} />
          </button>
        </div>

        {/* ===== DESKTOP NAV BUTTONS (hidden on mobile) ===== */}
        {currentIndex > 0 && (
          <button
            className="hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-colors z-20"
            onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex - 1) }}
          >
            <ChevronLeft size={28} />
          </button>
        )}
        {currentIndex < media.length - 1 && (
          <button
            className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-colors z-20"
            onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex + 1) }}
          >
            <ChevronRight size={28} />
          </button>
        )}

        {/* ===== THUMBNAIL STRIP ===== */}
        <ThumbnailStrip media={media} currentIndex={currentIndex} onNavigate={onNavigate} />
      </div>

      {/* ===== MOBILE METADATA PANEL (full-screen, photo on top + info below) ===== */}
      <AnimatePresence>
        {showMetadata && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
            className="md:hidden fixed inset-0 z-[110] bg-surface flex flex-col"
          >
            {/* Mobile header bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10 bg-surface sticky top-0 z-10">
              <h2 className="text-lg font-bold font-headline text-on-surface">Thông tin</h2>
              <button
                className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition"
                onClick={() => setShowMetadata(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {/* Photo preview */}
              <div className="w-full bg-black flex items-center justify-center" style={{ maxHeight: '45vh' }}>
                <img
                  src={current.thumbnails?.large || current.thumbnails?.medium || getMediaSrc(current)}
                  alt={current.original_name}
                  className="w-full object-contain"
                  style={{ maxHeight: '45vh' }}
                  draggable={false}
                />
              </div>

              {/* Metadata content */}
              <div className="px-5 py-5 flex flex-col gap-5">
                {/* Date + filename */}
                <div>
                  <p className="text-on-surface font-semibold text-[15px]">{formattedDate} · {formattedTime}</p>
                  <p className="text-on-surface-variant text-sm mt-1 break-all">{current.original_name}</p>
                </div>

                <div className="h-px bg-outline-variant/10 w-full"></div>

                {/* Camera + specs - compact Samsung-style layout */}
                <div>
                  <p className="text-on-surface font-semibold text-[15px] mb-1.5">{cameraModel}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-on-surface-variant">
                    <span>{formatSize(current.size)}</span>
                    <span className="text-outline-variant">|</span>
                    <span>{current.width || '-'}×{current.height || '-'}</span>
                    {current.width && current.height && (
                      <>
                        <span className="text-outline-variant">|</span>
                        <span>{((current.width * current.height) / 1_000_000).toFixed(1)}MP</span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-on-surface-variant mt-1">
                    {iso !== '-' && <span>{iso}</span>}
                    {iso !== '-' && <span className="text-outline-variant">|</span>}
                    {exif.FocalLength && (
                      <>
                        <span>{exif.FocalLength}mm</span>
                        <span className="text-outline-variant">|</span>
                      </>
                    )}
                    {aperture !== '-' && <span>{aperture}</span>}
                    {aperture !== '-' && exposure !== '-' && <span className="text-outline-variant">|</span>}
                    {exposure !== '-' && <span>{exposure}</span>}
                  </div>
                </div>

                <div className="h-px bg-outline-variant/10 w-full"></div>

                {/* Location */}
                {hasLocation ? (
                  <div>
                    <div className="w-full h-44 rounded-xl overflow-hidden shadow-inner mb-3">
                      <MapContainer
                        center={[current.metadata!.location!.lat, current.metadata!.location!.lng]}
                        zoom={13}
                        style={{ height: '100%', width: '100%' }}
                        zoomControl={false}
                        dragging={false}
                        scrollWheelZoom={false}
                        doubleClickZoom={false}
                        touchZoom={false}
                        attributionControl={false}
                        key={`mobile-map-${current.id}`}
                      >
                        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                        <Marker
                          position={[current.metadata!.location!.lat, current.metadata!.location!.lng]}
                          icon={L.divIcon({
                            className: '',
                            html: '<div style="width:16px;height:16px;background:var(--primary, #4f46e5);border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
                            iconSize: [16, 16],
                            iconAnchor: [8, 8],
                          })}
                        />
                      </MapContainer>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin size={16} className="text-on-surface-variant mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-on-surface text-sm font-medium">
                          {current.metadata!.location!.lat.toFixed(4)}, {current.metadata!.location!.lng.toFixed(4)}
                        </p>
                        <a href={`https://www.google.com/maps/search/?api=1&query=${current.metadata!.location!.lat},${current.metadata!.location!.lng}`}
                          target="_blank" rel="noreferrer"
                          className="text-xs font-bold text-primary mt-1 inline-block">
                          Mở bản đồ →
                        </a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-on-surface-variant">
                    <MapPin size={16} />
                    <p className="text-sm italic">Không có dữ liệu GPS</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== DESKTOP METADATA SIDEBAR ===== */}
      <AnimatePresence>
        {showMetadata && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 400, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
            className="hidden md:flex bg-surface flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.1)] z-20 overflow-y-auto overflow-x-hidden"
          >
            <div className="min-w-[400px]">
              {/* Header */}
              <div className="flex items-start justify-between p-8 pb-6 bg-surface z-10 sticky top-0 border-b border-outline-variant/10">
                <div>
                  <h2 className="text-3xl font-extrabold font-headline text-on-surface tracking-tight mb-1">Thông tin</h2>
                  <p className="text-on-surface-variant text-sm font-medium">Chi tiết ảnh</p>
                </div>
              </div>

              {/* Content */}
              <div className="px-8 pb-8 flex flex-col gap-8">
                {/* File Info */}
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-on-surface-variant uppercase mb-1">Tên tệp</p>
                    <p className="text-on-surface font-medium break-all">{current.original_name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-on-surface-variant uppercase mb-1">Ngày chụp</p>
                    <p className="text-on-surface font-medium">{formattedDate} • {formattedTime}</p>
                  </div>
                  <div className="h-px bg-outline-variant/10 w-full mt-6"></div>
                </div>

                {/* Tech Specs */}
                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-on-surface-variant uppercase mb-1">Kích thước</p>
                    <p className="text-on-surface font-semibold">{current.width || '-'} × {current.height || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-on-surface-variant uppercase mb-1">Dung lượng</p>
                    <p className="text-on-surface font-semibold">{formatSize(current.size)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-on-surface-variant uppercase mb-1">Máy ảnh</p>
                    <p className="text-on-surface font-semibold truncate" title={cameraModel}>{cameraModel}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-on-surface-variant uppercase mb-1">Khẩu độ</p>
                    <p className="text-on-surface font-semibold">{aperture}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-on-surface-variant uppercase mb-1">ISO</p>
                    <p className="text-on-surface font-semibold">{iso}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-on-surface-variant uppercase mb-1">Phơi sáng</p>
                    <p className="text-on-surface font-semibold">{exposure}</p>
                  </div>
                </div>

                <div className="h-px bg-surface-container-high w-full my-2"></div>

                {/* Location */}
                {hasLocation ? (
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-[10px] font-bold tracking-widest text-on-surface-variant uppercase">Vị trí</p>
                      <a href={`https://www.google.com/maps/search/?api=1&query=${current.metadata!.location!.lat},${current.metadata!.location!.lng}`}
                        target="_blank" rel="noreferrer"
                        className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                        Mở bản đồ
                      </a>
                    </div>
                    <p className="text-on-surface text-sm font-medium mb-4 whitespace-nowrap overflow-hidden text-ellipsis">
                      <MapPin size={14} className="inline mr-1 text-on-surface-variant" />
                      {current.metadata!.location!.lat.toFixed(4)}, {current.metadata!.location!.lng.toFixed(4)}
                    </p>
                    <div className="w-full h-40 rounded-xl overflow-hidden shadow-inner">
                      <MapContainer
                        center={[current.metadata!.location!.lat, current.metadata!.location!.lng]}
                        zoom={13}
                        style={{ height: '100%', width: '100%' }}
                        zoomControl={false}
                        dragging={false}
                        scrollWheelZoom={false}
                        doubleClickZoom={false}
                        touchZoom={false}
                        attributionControl={false}
                        key={`desktop-map-${current.id}`}
                      >
                        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                        <Marker
                          position={[current.metadata!.location!.lat, current.metadata!.location!.lng]}
                          icon={L.divIcon({
                            className: '',
                            html: '<div style="width:16px;height:16px;background:var(--primary, #4f46e5);border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>',
                            iconSize: [16, 16],
                            iconAnchor: [8, 8],
                          })}
                        />
                      </MapContainer>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-on-surface-variant uppercase mb-1">Vị trí</p>
                    <p className="text-on-surface-variant font-medium text-sm italic">Không có dữ liệu GPS</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
