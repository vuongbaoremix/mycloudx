import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api/client'

export interface MediaItem {
  id: string
  original_name: string
  mime_type: string
  size?: number
  width?: number
  height?: number
  thumbnails: {
    micro?: string
    small?: string
    medium?: string
    large?: string
  }
  blur_hash?: string
  aspect_ratio: number
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

interface UseMediaDataOptions {
  filterMimeType?: string
}

export function useMediaData({ filterMimeType }: UseMediaDataOptions = {}) {
  const [media, setMedia] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const loadingRef = useRef(false)
  const [totalItems, setTotalItems] = useState(0)

  const loadMedia = useCallback(async (pageNum: number, reset = false) => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const data = await api.listMedia({ page: pageNum, limit: 100, mime_type: filterMimeType })
      const items = data.items || []
      setMedia((prev) => (reset ? items : [...prev, ...items]))
      setPage(pageNum)
      if (data.total) setTotalItems(data.total)
    } catch (err) {
      console.error('Failed to load media:', err)
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [filterMimeType])

  // Initial load
  useEffect(() => {
    loadMedia(1, true)
  }, [loadMedia])

  // Lazy load: only load next page when requested (scroll near bottom)
  const hasMore = totalItems > 0 && media.length < totalItems

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return
    loadMedia(page + 1, false)
  }, [hasMore, page, loadMedia])

  // Upload complete event handler
  useEffect(() => {
    const handleUploadCompleteEvent = (e: Event) => {
      const customEvent = e as CustomEvent
      handleUploadComplete(customEvent.detail)
    }
    window.addEventListener('upload-complete', handleUploadCompleteEvent)
    return () => window.removeEventListener('upload-complete', handleUploadCompleteEvent)
  }, [])

  const handleUploadComplete = (newMedia: MediaItem) => {
    setMedia((prev) => [newMedia, ...prev])
    setTotalItems((prev) => prev + 1)
  }

  // Keep a ref to media for polling without re-triggering the effect
  const mediaRef = useRef(media)
  mediaRef.current = media

  // Polling for processing items — use ref to avoid interval recreation on media change
  useEffect(() => {
    const intervalId = setInterval(async () => {
      const currentMedia = mediaRef.current
      const processingIds = currentMedia.filter(m => m.status === 'processing').map(m => m.id)
      if (processingIds.length === 0) return

      try {
        const idsToCheck = processingIds.slice(0, 10)
        const checks = await Promise.all(idsToCheck.map(id => api.getMedia(id).catch(() => null)))

        const readyItems = checks.filter((r): r is MediaItem => r !== null && r.status === 'ready')
        if (readyItems.length > 0) {
          setMedia(prev => {
            const next = [...prev]
            readyItems.forEach(readyItem => {
              const idx = next.findIndex(m => m.id === readyItem.id)
              if (idx !== -1) {
                if (next[idx]._previewUrl) {
                  URL.revokeObjectURL(next[idx]._previewUrl!)
                }
                next[idx] = { ...readyItem, _previewUrl: undefined }
              }
            })
            return next
          })
        }
      } catch (err) {
        console.error('Polling error', err)
      }
    }, 5000)

    return () => clearInterval(intervalId)
  }, [])

  const handleToggleFavorite = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    try {
      const updated = await api.toggleFavorite(id)
      setMedia((prev) =>
        prev.map((m) => (m.id === id ? { ...m, is_favorite: updated.is_favorite } : m))
      )
    } catch (err) {
      console.error('Failed to toggle favorite:', err)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteMedia(id)
      setMedia((prev) => prev.filter((m) => m.id !== id))
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  return {
    media,
    loading,
    totalItems,
    hasMore,
    loadMore,
    setMedia,
    handleToggleFavorite,
    handleDelete,
  }
}
