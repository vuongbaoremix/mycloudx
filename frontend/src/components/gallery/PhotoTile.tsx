import { motion } from 'framer-motion'
import { useState } from 'react'

interface PhotoTileProps {
  media: {
    id: string
    original_name: string
    thumbnails: {
      micro?: string
      small?: string
      medium?: string
    }
    blur_hash?: string
    is_favorite: boolean
  }
  onClick: () => void
  onFavorite: () => void
}

export default function PhotoTile({ media, onClick, onFavorite }: PhotoTileProps) {
  const src = media.thumbnails.small || media.thumbnails.micro || ''
  const [loaded, setLoaded] = useState(false)

  return (
    <motion.div
      className="photo-tile"
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      whileHover={{ y: -2, boxShadow: '0 8px 16px rgba(0,0,0,0.3)' }}
      whileTap={{ scale: 0.98 }}
    >
      {src ? (
        <img
          src={src}
          alt={media.original_name}
          loading="lazy"
          className={`w-full h-full object-cover transition-opacity duration-400 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
        />
      ) : (
        <div className="w-full h-full bg-surface-container flex items-center justify-center text-on-surface-variant text-xs">
          {media.original_name}
        </div>
      )}

      {!loaded && src && (
        <div className="absolute inset-0 skeleton-shimmer" />
      )}

      {media.is_favorite && (
        <div className="fav-badge">
          <span
            className="material-symbols-outlined text-[16px]"
            style={{ color: 'var(--warning, #f59e0b)', fontVariationSettings: "'FILL' 1" }}
          >
            favorite
          </span>
        </div>
      )}

      <div className="overlay">
        <button
          className="btn btn-ghost"
          onClick={(e) => {
            e.stopPropagation()
            onFavorite()
          }}
        >
          <span
            className="material-symbols-outlined text-[16px]"
            style={{
              color: media.is_favorite ? 'var(--warning)' : 'white',
              fontVariationSettings: media.is_favorite ? "'FILL' 1" : "'FILL' 0"
            }}
          >
            favorite
          </span>
        </button>
      </div>
    </motion.div>
  )
}
