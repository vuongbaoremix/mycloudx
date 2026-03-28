import { useState, useEffect } from 'react'
import { Trash2, RotateCcw } from 'lucide-react'
import api from '../api/client'
import Lightbox from '../components/gallery/Lightbox'
import { SkeletonGrid } from '../components/ui/Skeleton'
import ViewModeToggle, { type ViewMode } from '../components/gallery/ViewModeToggle'

export default function Trash() {
  const [media, setMedia] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid-medium')

  useEffect(() => {
    api.listMedia({ trash: true }).then((data) => {
      setMedia(data.items || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleRestore = async (id: string) => {
    await api.restoreMedia(id)
    setMedia((prev) => prev.filter((m) => m.id !== id))
  }

  if (loading) return <SkeletonGrid count={8} viewMode={viewMode} />

  return (
    <div className="gallery-container">
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-8">
        <h1 className="text-2xl font-extrabold font-headline text-on-surface tracking-tight">Thùng rác</h1>
        {media.length > 0 && (
          <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
        )}
      </div>

      {media.length === 0 ? (
        <div className="empty-state">
          <Trash2 size={64} className="empty-state-icon" />
          <h3>Thùng rác trống</h3>
          <p>Các ảnh bị xóa sẽ hiển thị ở đây</p>
        </div>
      ) : (
        <div className={`grid grid-cols-12 ${viewMode === 'grid-large' ? 'gap-4 sm:gap-6' : viewMode === 'grid-medium' ? 'gap-2 sm:gap-4' : 'gap-1 sm:gap-2'}`}>
          {media.map((item, index) => {
            let colSpan = "col-span-6 sm:col-span-6 md:col-span-4 lg:col-span-4 xl:col-span-3 aspect-square"
            if (viewMode === 'grid-medium') {
              colSpan = "col-span-4 sm:col-span-4 md:col-span-3 lg:col-span-3 xl:col-span-2 aspect-square"
            } else if (viewMode === 'grid-small') {
              colSpan = "col-span-3 sm:col-span-3 md:col-span-2 lg:col-span-2 xl:col-span-1 aspect-square"
            }

            let thumbSrc = item.thumbnails?.medium || item.thumbnails?.small || item.thumbnails?.micro;
            if (viewMode === 'grid-small') thumbSrc = item.thumbnails?.small || item.thumbnails?.medium;
            else if (viewMode === 'grid-large') thumbSrc = item.thumbnails?.large || item.thumbnails?.medium || item.thumbnails?.small || item.thumbnails?.micro;

            const isVideo = item.mime_type?.startsWith('video/')
            if (!thumbSrc && isVideo) thumbSrc = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiPjwvc3ZnPg==';
            
            return (
              <div
                key={item.id}
                className={`${colSpan} relative group rounded-xl overflow-hidden cursor-pointer bg-surface-container-high shadow-xl shadow-on-surface/5 transition-all`}
                onClick={() => setLightboxIndex(index)}
              >
                <img
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  src={thumbSrc || ''}
                  alt={item.original_name}
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-on-background/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                
                {isVideo && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-on-background/20 transition-all">
                    <span className="material-symbols-outlined text-white text-5xl" data-icon="play_circle">play_circle</span>
                  </div>
                )}

                <button
                  className="absolute bottom-3 right-3 btn btn-secondary px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRestore(item.id)
                  }}
                >
                  <RotateCcw size={14} className="mr-1" /> Khôi phục
                </button>

                {viewMode !== 'grid-small' && (
                  <div className={`absolute pointer-events-none text-white transform translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all ${viewMode === 'grid-medium' ? 'bottom-3 left-3' : 'bottom-6 left-6'}`}>
                    <p className={`font-bold truncate max-w-[200px] ${viewMode === 'grid-medium' ? 'text-sm' : 'text-lg'}`}>{item.original_name}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          media={media}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onFavorite={() => {}}
        />
      )}
    </div>
  )
}
