import { useState, useEffect } from 'react'
import { Heart } from 'lucide-react'
import api from '../api/client'
import Lightbox from '../components/gallery/Lightbox'
import { SkeletonGrid } from '../components/ui/Skeleton'
import ViewModeToggle, { type ViewMode } from '../components/gallery/ViewModeToggle'

export default function Favorites() {
  const [media, setMedia] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid-medium')

  useEffect(() => {
    api.listMedia({ favorite: true }).then((data) => {
      setMedia(data.items || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <SkeletonGrid count={8} viewMode={viewMode} />

  return (
    <div className="gallery-container">
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-8">
        <h1 className="text-2xl font-extrabold font-headline text-on-surface tracking-tight">Yêu thích</h1>
        {media.length > 0 && (
          <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
        )}
      </div>

      {media.length === 0 ? (
        <div className="empty-state">
          <Heart size={64} className="empty-state-icon" />
          <h3>Chưa có ảnh yêu thích</h3>
          <p>Nhấn biểu tượng trái tim trên ảnh để thêm vào danh sách yêu thích</p>
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

                <div 
                  className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all cursor-pointer p-2 -m-2 z-10"
                  onClick={(e) => {
                    e.stopPropagation()
                    api.toggleFavorite(item.id).then(() => setMedia((prev) => prev.filter((m) => m.id !== item.id)))
                  }}
                >
                  <span className="material-symbols-outlined drop-shadow-md" style={{ color: 'var(--warning, #f59e0b)', fontVariationSettings: "'FILL' 1" }}>
                    favorite
                  </span>
                </div>

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
          onFavorite={(id) => api.toggleFavorite(id).then(() => setMedia((prev) => prev.filter((m) => m.id !== id)))}
        />
      )}
    </div>
  )
}
