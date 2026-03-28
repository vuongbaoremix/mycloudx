import { useState, useRef, useMemo, useCallback } from 'react'
import api from '../api/client'
import Lightbox from '../components/gallery/Lightbox'
import { SkeletonGrid } from '../components/ui/Skeleton'
import { useMediaData, type MediaItem } from '../hooks/useMediaData'
import { useMediaSelection } from '../hooks/useMediaSelection'
import GalleryHeader from '../components/gallery/GalleryHeader'
import VirtualizedMediaGrid from '../components/gallery/VirtualizedMediaGrid'
import SelectionActionBar from '../components/gallery/SelectionActionBar'
import AlbumModal from '../components/gallery/AlbumModal'
import ShareModal from '../components/gallery/ShareModal'

type ViewMode = 'timeline' | 'grid-large' | 'grid-medium' | 'grid-small'

interface GalleryProps {
  title?: string
  filterMimeType?: string
}

export default function Gallery({ title = "Photos", filterMimeType }: GalleryProps) {
  const {
    media, loading, totalItems, hasMore, loadMore,
    handleToggleFavorite, handleDelete,
  } = useMediaData({ filterMimeType })

  const {
    selectedItems, selectionMode,
    toggleSelection, cancelSelection, selectAll, toggleGroupSelection,
    handleTouchStart, handleTouchMove, handleTouchEnd,
  } = useMediaSelection(media)

  const [viewMode, setViewMode] = useState<ViewMode>('timeline')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Drag-to-select (desktop only)
  const galleryRef = useRef<HTMLDivElement>(null)
  const [dragRect, setDragRect] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null)
  const isDragSelectingRef = useRef(false)

  const handleGalleryMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button, a, [role="button"], .selection-checkbox')) return
    if (!window.matchMedia('(pointer: fine)').matches) return

    const startX = e.clientX
    const startY = e.clientY
    isDragSelectingRef.current = false

    const onMouseMove = (me: MouseEvent) => {
      const dx = me.clientX - startX
      const dy = me.clientY - startY
      if (!isDragSelectingRef.current && Math.abs(dx) < 5 && Math.abs(dy) < 5) return
      isDragSelectingRef.current = true
      setDragRect({ startX, startY, currentX: me.clientX, currentY: me.clientY })
    }

    const onMouseUp = () => {
      setDragRect(null)
      isDragSelectingRef.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.userSelect = 'none'
  }, [])

  // Modals state
  const [showAlbumModal, setShowAlbumModal] = useState(false)
  const [albums, setAlbums] = useState<any[]>([])
  const [showShareModal, setShowShareModal] = useState(false)

  const handleItemClick = useCallback((globalIndex: number, itemId: string, e: React.MouseEvent) => {
    if (selectionMode) {
      toggleSelection(itemId, e)
    } else if (e.shiftKey || e.ctrlKey || e.metaKey) {
      toggleSelection(itemId, e)
    } else {
      setLightboxIndex(globalIndex)
    }
  }, [selectionMode, toggleSelection])

  const handleMultiDelete = async () => {
    if (!confirm(`Delete ${selectedItems.size} items?`)) return
    try {
      await Promise.all(Array.from(selectedItems).map(id => api.deleteMedia(id)))
      cancelSelection()
      // Reload will happen through state update in useMediaData
      window.location.reload()
    } catch (err) {
      console.error('Failed to delete some items:', err)
    }
  }

  const handleOpenAlbumModal = async () => {
    setShowAlbumModal(true)
    const data = await api.listAlbums()
    setAlbums(data)
  }

  const handleAddToAlbum = async (albumId: string) => {
    try {
      await api.addMediaToAlbum(albumId, Array.from(selectedItems))
      setShowAlbumModal(false)
      cancelSelection()
    } catch (e) {
      console.error(e)
    }
  }

  // Group media by date
  const groupedMedia = useMemo(() => media.reduce((acc, item) => {
    const date = new Date(item.created_at)
    const dateKey = date.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    let label = dateKey
    if (date.toDateString() === today.toDateString()) {
      label = 'Hôm nay'
    } else if (date.toDateString() === yesterday.toDateString()) {
      label = 'Hôm qua'
    }

    const shortDate = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    if (!acc[label]) acc[label] = { dateKey: shortDate, items: [] }
    acc[label].items.push(item)
    return acc
  }, {} as Record<string, { dateKey: string, items: MediaItem[] }>), [media])

  if (loading && media.length === 0) {
    return <SkeletonGrid count={12} viewMode={viewMode} />
  }

  return (
    <div className="max-w-[1800px] mx-auto px-1 md:px-8 py-1 md:py-10" ref={galleryRef} onMouseDown={handleGalleryMouseDown}>
      {/* Drag-to-select rectangle overlay */}
      {dragRect && (
        <div
          className="drag-select-rect"
          style={{
            position: 'fixed',
            left: Math.min(dragRect.startX, dragRect.currentX),
            top: Math.min(dragRect.startY, dragRect.currentY),
            width: Math.abs(dragRect.currentX - dragRect.startX),
            height: Math.abs(dragRect.currentY - dragRect.startY),
          }}
        />
      )}

      <GalleryHeader
        title={title}
        totalItems={totalItems}
        mediaCount={media.length}
        viewMode={viewMode}
        setViewMode={setViewMode}
        selectionMode={selectionMode}
        cancelSelection={cancelSelection}
      />

      <VirtualizedMediaGrid
        media={media}
        groupedMedia={groupedMedia}
        viewMode={viewMode}
        selectedItems={selectedItems}
        selectionMode={selectionMode}
        totalItems={totalItems}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onItemClick={handleItemClick}
        onToggleSelection={toggleSelection}
        onToggleFavorite={handleToggleFavorite}
        onToggleGroupSelection={toggleGroupSelection}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          media={media}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onFavorite={(id) => handleToggleFavorite(id)}
          onDelete={handleDelete}
        />
      )}

      {/* Floating Action Bar for Selection */}
      {selectionMode && (
        <SelectionActionBar
          selectedItems={selectedItems}
          mediaCount={media.length}
          cancelSelection={cancelSelection}
          selectAll={selectAll}
          onMultiDelete={handleMultiDelete}
          onOpenAlbumModal={handleOpenAlbumModal}
          onOpenShareModal={() => setShowShareModal(true)}
        />
      )}

      {/* Add to Album Modal */}
      {showAlbumModal && (
        <AlbumModal
          albums={albums}
          onAddToAlbum={handleAddToAlbum}
          onClose={() => setShowAlbumModal(false)}
        />
      )}

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal
          selectedCount={selectedItems.size}
          selectedItems={selectedItems}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  )
}
