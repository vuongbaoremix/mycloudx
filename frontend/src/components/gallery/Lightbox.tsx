import { useEffect, useLayoutEffect, useCallback, useState, useRef, useMemo } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Heart,
  RotateCw,
  FlipHorizontal,
  MapPin,
  Download,
  Info,
  Trash2,
  MoreVertical
} from 'lucide-react'
import VideoPlayer from './VideoPlayer'

interface MediaItem {
  id: string
  original_name: string
  mime_type: string
  size?: number
  width?: number
  height?: number
  thumbnails: { web?: string; large?: string; medium?: string; small?: string; micro?: string }
  is_favorite: boolean
  is_encrypted?: boolean
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
  shareToken?: string
}

function appendToken(url: string, token?: string) {
  if (!token || !url) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}token=${token}`
}

function getMediaSrc(item: MediaItem, shareToken?: string) {
  if (item._previewUrl) return item._previewUrl
  if (item.mime_type.startsWith('image/') && item.thumbnails?.web) {
    return appendToken(item.thumbnails.web, shareToken)
  }
  if (item.storage_path) {
    return appendToken(`/api/media/serve/${encodeURIComponent(item.storage_path)}`, shareToken)
  }
  
  // Ultimate fallback if backend DTO was cached or missing storage_path
  const fallback = item.thumbnails?.large || item.thumbnails?.medium || item.thumbnails?.small || item.thumbnails?.micro || '';
  return appendToken(fallback, shareToken)
}

function getThumbSrc(item: MediaItem, shareToken?: string) {
  const src = item.thumbnails?.small || item.thumbnails?.micro || item.thumbnails?.medium || ''
  return appendToken(src, shareToken)
}

// ========== THUMBNAIL STRIP ==========
function ThumbnailStrip({
  media,
  currentIndex,
  onNavigate,
  shareToken,
}: {
  media: MediaItem[]
  currentIndex: number
  onNavigate: (index: number) => void
  shareToken?: string
}) {
  const stripRef = useRef<HTMLDivElement>(null)

  // Limit visible range for performance (show ±30 around current)
  const visibleRange = useMemo(() => {
    const start = Math.max(0, currentIndex - 30)
    const end = Math.min(media.length, currentIndex + 31)
    return { start, end }
  }, [currentIndex, media.length])

  // Auto-scroll to keep current thumb visible
  useEffect(() => {
    if (!stripRef.current) return
    // DOM children: [spacer?] [thumb0] [thumb1] ... [spacer?]
    // Calculate the correct child index accounting for the spacer div
    const spacerOffset = visibleRange.start > 0 ? 1 : 0
    const thumbIndexInDOM = spacerOffset + (currentIndex - visibleRange.start)
    const thumb = stripRef.current.children[thumbIndexInDOM] as HTMLElement
    if (thumb) {
      thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [currentIndex, visibleRange.start])

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
                src={getThumbSrc(item, shareToken)}
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

// ProgressiveImage has been removed as the unified Web 1920px size allows direct rendering without jank.

// ========== MAIN LIGHTBOX ==========
export default function Lightbox({
  media,
  currentIndex,
  onClose,
  onNavigate,
  onFavorite,
  onDelete,
  shareToken,
}: LightboxProps) {
  const current = media[currentIndex]
  const [showMetadata, setShowMetadata] = useState(false)
  const [showUI, setShowUI] = useState(true)
  const [showMobileMoreMenu, setShowMobileMoreMenu] = useState(false)

  // Zoom & transform state
  const [isZoomed, setIsZoomed] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [flip, setFlip] = useState(false)

  // Swipe state
  const containerRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)

  // Reset on image change
  useLayoutEffect(() => {
    x.set(0)
    setIsZoomed(false)
    setRotation(0)
    setFlip(false)
    setShowMobileMoreMenu(false)
  }, [currentIndex, x])

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
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  // Prevent layout thrashing on mobile: lock body scroll set up
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Preload adjacent images
  useEffect(() => {
    ;[-2, -1, 1, 2].forEach(offset => {
      const idx = currentIndex + offset
      if (idx >= 0 && idx < media.length) {
        const item = media[idx]
        const src = appendToken(item.thumbnails?.web || item.thumbnails?.large || '', shareToken) || getMediaSrc(item, shareToken)
        if (src) { const img = new Image(); img.src = src }
      }
    })
  }, [currentIndex, media])

  const handleDownload = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      let href: string
      if (shareToken) {
        // Anonymous public share: use serve_file with token + download flag
        href = `/api/media/serve/${encodeURIComponent(current.storage_path)}?download=1&token=${shareToken}`
      } else {
        // Authenticated user: get short-lived download token
        const auth_token = typeof window !== 'undefined' ? localStorage.getItem('mycloud_token') : null;
        if (!auth_token) return;
        const res = await fetch('/api/auth/download-token', {
          headers: { 'Authorization': `Bearer ${auth_token}` }
        });
        if (!res.ok) throw new Error('Failed to get download token');
        const data = await res.json();
        href = `/api/media/${current.id}/download?token=${data.token}`
      }
      const link = document.createElement('a');
      link.href = href;
      link.download = current.original_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Download failed", err);
      alert("Không thể tải xuống. Vui lòng thử lại.");
    }
  }

  const handleDragEnd = (_e: any, { offset, velocity }: any) => {
    if (isZoomed) return;
    const threshold = window.innerWidth * 0.15;
    if (offset.x < -threshold || (offset.x < -30 && velocity.x < -300)) {
      if (currentIndex < media.length - 1) {
        animate(x, -window.innerWidth, { duration: 0.3, ease: [0.25, 1, 0.5, 1] }).then(() => onNavigate(currentIndex + 1));
        return;
      }
    } else if (offset.x > threshold || (offset.x > 30 && velocity.x > 300)) {
      if (currentIndex > 0) {
        animate(x, window.innerWidth, { duration: 0.3, ease: [0.25, 1, 0.5, 1] }).then(() => onNavigate(currentIndex - 1));
        return;
      }
    }
    // Snap back
    animate(x, 0, { type: "spring", stiffness: 300, damping: 30 });
  }

  if (!current) return null

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
    <div className="fixed inset-0 z-[100] flex font-body bg-gradient-to-br from-[#0f172a] to-[#020617] transform-gpu">
      {/* Photo Viewer Area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden select-none touch-none"
        onClick={() => {
          if (showMobileMoreMenu) setShowMobileMoreMenu(false)
          else setShowUI(s => !s)
        }}
      >
        {/* ===== UNIFIED CAROUSEL & ZOOM VIEW ===== */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center will-change-transform"
          style={{ x }}
          drag={!isZoomed ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={1}
          onDragEnd={handleDragEnd}
        >
          {/* Previous image */}
          {prev && !isZoomed && (
            <div
              className="absolute inset-0 flex items-center justify-center p-2"
              style={{ transform: `translateX(-100%)` }}
            >
              <img
                src={appendToken(prev.thumbnails?.web || prev.thumbnails?.large || '', shareToken) || getMediaSrc(prev, shareToken)}
                alt={prev.original_name}
                className={`object-contain ${sizeClass} pointer-events-none`}
                draggable={false}
              />
            </div>
          )}

          {/* Current image with Zoom implementation */}
          <div className="flex items-center justify-center w-full h-full transform-gpu relative z-10" onClick={(e) => e.stopPropagation()}>
            <TransformWrapper
              initialScale={1}
              initialPositionX={0}
              initialPositionY={0}
              onTransformed={(ref) => setIsZoomed(ref.state.scale > 1)}
              doubleClick={{ step: 1.5 }}
              disablePadding

            >
              <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div
                  className="flex items-center justify-center w-full h-full"
                  onClick={() => {
                    if (showMobileMoreMenu) setShowMobileMoreMenu(false)
                    else setShowUI(s => !s)
                  }}
                  style={{ transform: `scaleX(${flip ? -1 : 1}) rotate(${rotation}deg)` }}
                >
                  {current.mime_type.startsWith('video/') ? (
                    <VideoPlayer
                      src={appendToken(`/api/media/serve/${encodeURIComponent(current.storage_path)}`, shareToken)}
                      poster={appendToken(current.thumbnails?.web || current.thumbnails?.large || '', shareToken)}
                      className={`drop-shadow-[0_25px_50px_rgba(0,0,0,0.5)] ${sizeClass}`}
                    />
                  ) : (
                    <img
                      src={getMediaSrc(current, shareToken)}
                      alt={current.original_name}
                      className={`object-contain drop-shadow-[0_25px_50px_rgba(0,0,0,0.5)] ${sizeClass} pointer-events-none`}
                      draggable={false}
                      decoding="async"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        const fallback = appendToken(current.thumbnails?.medium || current.thumbnails?.small || current.thumbnails?.micro || '', shareToken);
                        if (fallback && target.src !== new URL(fallback, window.location.href).href) {
                          target.src = fallback;
                        }
                      }}
                    />
                  )}
                </div>
              </TransformComponent>
            </TransformWrapper>
          </div>

          {/* Next image */}
          {next && !isZoomed && (
            <div
              className="absolute inset-0 flex items-center justify-center p-2"
              style={{ transform: `translateX(100%)` }}
            >
              <img
                src={appendToken(next.thumbnails?.web || next.thumbnails?.large || '', shareToken) || getMediaSrc(next, shareToken)}
                alt={next.original_name}
                className={`object-contain ${sizeClass} pointer-events-none`}
                draggable={false}
              />
            </div>
          )}
        </motion.div>

        {/* ===== UI OVERLAYS ===== */}
        <AnimatePresence>
          {showUI && (
            <>
              {/* DESKTOP TOP HEADER (hidden on mobile) */}
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="hidden md:flex absolute top-6 left-6 z-30 pointer-events-none"
              >
                <div className="flex items-center pointer-events-auto gap-2">
                  <span className="text-white/60 text-sm font-medium bg-black/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/5 shadow-lg">
                    {currentIndex + 1} / {media.length}
                  </span>
                  {current.is_encrypted && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/20 text-primary border border-primary/30 shadow-lg backdrop-blur-md font-medium text-sm" title="Bảo mật E2EE">
                      <span className="material-symbols-outlined text-[16px]">lock</span>
                      E2EE
                    </span>
                  )}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="hidden md:flex absolute top-6 right-6 z-30 items-center justify-end gap-3 pointer-events-none"
              >
                <div className="flex items-center gap-3 pointer-events-auto">
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
              </motion.div>

              {/* DESKTOP TOP TOOLBAR */}
              <motion.div
                initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }}
                className="hidden md:flex absolute top-6 left-1/2 -translate-x-1/2 items-center gap-2 bg-white/10 hover:bg-white/15 transition-colors backdrop-blur-xl px-4 py-2 rounded-full border border-white/5 z-30 shadow-lg"
              >
                <button className="p-2 text-white/80 hover:text-white transition-colors"
                  onClick={(e) => { e.stopPropagation(); setRotation(r => r + 90) }} title="Xoay ảnh">
                  <RotateCw size={20} />
                </button>
                <button className="p-2 text-white/80 hover:text-white transition-colors"
                  onClick={(e) => { e.stopPropagation(); setFlip(f => !f) }} title="Lật ảnh">
                  <FlipHorizontal size={20} />
                </button>
                <div className="w-px h-6 bg-white/20 mx-1"></div>
                <button
                  onClick={handleDownload}
                  className="p-2 text-white/80 hover:text-white transition-colors" title="Tải xuống"
                >
                  <Download size={20} />
                </button>
                <button className="p-2 transition-colors ml-1" onClick={(e) => { e.stopPropagation(); onFavorite(current.id) }}>
                  <Heart size={20} fill={current.is_favorite ? '#f59e0b' : 'none'} color={current.is_favorite ? '#f59e0b' : 'white'} />
                </button>
                {onDelete && (
                  <>
                    <div className="w-px h-6 bg-white/20 mx-1"></div>
                    <button className="p-2 text-white/80 hover:text-red-400 transition-colors"
                      onClick={(e) => { e.stopPropagation(); onDelete(current.id) }} title="Xóa khỏi album">
                      <Trash2 size={20} />
                    </button>
                  </>
                )}
              </motion.div>

              {/* MOBILE UNIFIED TOP HEADER */}
              <motion.div
                initial={{ y: '-100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '-100%', opacity: 0 }}
                className="md:hidden absolute top-0 left-0 right-0 z-40 bg-gradient-to-b from-black/80 to-transparent pt-2 pb-4 px-3 flex flex-col pointer-events-none"
              >
                <div className="flex items-center justify-between pointer-events-auto mt-2">
                  <div className="flex items-center gap-2">
                    <button className="p-2 text-white hover:bg-white/10 rounded-full transition-colors" onClick={(e) => { e.stopPropagation(); onClose() }}>
                      <ChevronLeft size={28} />
                    </button>
                    <div className="flex items-center gap-1.5 ml-1">
                      <span className="text-white/90 text-sm font-medium bg-white/10 px-2 py-1 rounded-md">{currentIndex + 1} / {media.length}</span>
                      {current.is_encrypted && (
                        <span className="flex items-center justify-center p-1 bg-primary/20 text-primary border border-primary/30 rounded-md shadow-lg" title="Mã hóa đầu cuối E2EE">
                          <span className="material-symbols-outlined text-[16px]">lock</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-white/90 relative">
                    <button className="p-2 hover:bg-white/10 rounded-full transition-colors" onClick={(e) => { e.stopPropagation(); onFavorite(current.id) }}>
                      <Heart size={22} fill={current.is_favorite ? '#f59e0b' : 'none'} color={current.is_favorite ? '#f59e0b' : 'currentColor'} />
                    </button>
                    <button className={`p-2 rounded-full transition-colors ${showMetadata ? 'bg-primary/80 text-white' : 'hover:bg-white/10'}`}
                      onClick={(e) => { e.stopPropagation(); setShowMetadata(!showMetadata); setShowMobileMoreMenu(false); }}>
                      <Info size={22} />
                    </button>
                    <button className={`p-2 rounded-full transition-colors ${showMobileMoreMenu ? 'bg-white/20' : 'hover:bg-white/10'}`}
                      onClick={(e) => { e.stopPropagation(); setShowMobileMoreMenu(!showMobileMoreMenu) }}>
                      <MoreVertical size={22} />
                    </button>

                    <AnimatePresence>
                      {showMobileMoreMenu && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -10 }}
                          transition={{ duration: 0.15 }}
                          className="absolute top-12 right-0 bg-surface/95 backdrop-blur-xl border border-outline-variant/20 rounded-2xl shadow-2xl py-2 min-w-[200px] flex flex-col z-50 pointer-events-auto"
                        >
                          <button className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container transition-colors text-on-surface text-sm font-medium"
                            onClick={(e) => { e.stopPropagation(); handleDownload(e); setShowMobileMoreMenu(false); }}>
                            <Download size={18} />
                            Tải xuống
                          </button>
                          <button className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container transition-colors text-on-surface text-sm font-medium"
                            onClick={(e) => { e.stopPropagation(); setRotation(r => r + 90); setShowMobileMoreMenu(false); }}>
                            <RotateCw size={18} />
                            Xoay ảnh
                          </button>
                          <button className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container transition-colors text-on-surface text-sm font-medium"
                            onClick={(e) => { e.stopPropagation(); setFlip(f => !f); setShowMobileMoreMenu(false); }}>
                            <FlipHorizontal size={18} />
                            Lật ảnh
                          </button>
                          {onDelete && (
                            <>
                              <div className="h-px bg-outline-variant/10 my-1 mx-2"></div>
                              <button className="flex items-center gap-3 px-4 py-3 hover:bg-error-container/20 transition-colors text-error text-sm font-medium"
                                onClick={(e) => { e.stopPropagation(); onDelete(current.id); setShowMobileMoreMenu(false); }}>
                                <Trash2 size={18} />
                                Xóa
                              </button>
                            </>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>

              {/* ===== DESKTOP NAV BUTTONS (hidden on mobile) ===== */}
              {currentIndex > 0 && (
                <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-colors z-20 shadow-lg pointer-events-auto"
                  onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex - 1) }}
                >
                  <ChevronLeft size={28} />
                </motion.button>
              )}
              {currentIndex < media.length - 1 && (
                <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-colors z-20 shadow-lg pointer-events-auto"
                  onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex + 1) }}
                >
                  <ChevronRight size={28} />
                </motion.button>
              )}

              {/* ===== THUMBNAIL STRIP ===== */}
              <motion.div
                initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
                className="absolute bottom-2 md:bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-[95vw] md:max-w-[70vw] pointer-events-auto"
              >
                <ThumbnailStrip media={media} currentIndex={currentIndex} onNavigate={onNavigate} shareToken={shareToken} />
              </motion.div>
            </>
          )}
        </AnimatePresence>
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
                  src={appendToken(current.thumbnails?.web || current.thumbnails?.large || '', shareToken) || getMediaSrc(current, shareToken)}
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

                {current.is_encrypted && (
                  <>
                    <div className="h-px bg-outline-variant/10 w-full"></div>
                    <div className="flex items-center gap-3 bg-primary/10 text-primary p-3 rounded-xl">
                      <span className="material-symbols-outlined text-2xl">lock</span>
                      <div>
                        <p className="font-semibold text-sm">Được bảo vệ bằng E2EE</p>
                        <p className="text-xs opacity-80 mt-0.5">Tệp này được mã hóa đầu cuối an toàn</p>
                      </div>
                    </div>
                  </>
                )}

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

                {current.is_encrypted && (
                  <div className="flex items-center gap-3 bg-primary/10 text-primary p-4 rounded-2xl">
                    <span className="material-symbols-outlined text-[28px]">lock</span>
                    <div>
                      <p className="font-bold text-sm">Bảo mật ưu tiên</p>
                      <p className="text-xs mt-0.5 opacity-90 leading-relaxed">Tệp này được mã hóa đầu cuối (E2EE). Chỉ bạn mới có thể xem được nội dung.</p>
                    </div>
                  </div>
                )}

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
