import { useState, useRef, useCallback } from 'react'
import type { MediaItem } from './useMediaData'

export function useMediaSelection(media: MediaItem[]) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const selectionMode = selectedItems.size > 0
  const lastSelectedIndexRef = useRef<number | null>(null)

  // Touch handlers for mobile
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = useRef(false)
  const touchSelectActiveRef = useRef(false)

  const toggleSelection = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const currentIndex = media.findIndex(m => m.id === id)

    if (e.shiftKey && lastSelectedIndexRef.current !== null) {
      const start = Math.min(lastSelectedIndexRef.current, currentIndex)
      const end = Math.max(lastSelectedIndexRef.current, currentIndex)
      const rangeIds = media.slice(start, end + 1).map(m => m.id)
      setSelectedItems(prev => {
        const next = new Set(prev)
        rangeIds.forEach(rid => next.add(rid))
        return next
      })
    } else {
      setSelectedItems(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }
    lastSelectedIndexRef.current = currentIndex
  }, [media])

  const cancelSelection = useCallback(() => {
    setSelectedItems(new Set())
    lastSelectedIndexRef.current = null
  }, [])

  const selectAll = useCallback(() => {
    setSelectedItems(new Set(media.map(m => m.id)))
  }, [media])

  const toggleGroupSelection = useCallback((groupItems: MediaItem[]) => {
    const groupIds = groupItems.map(m => m.id)
    const allSelected = groupIds.every(id => selectedItems.has(id))
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (allSelected) {
        groupIds.forEach(id => next.delete(id))
      } else {
        groupIds.forEach(id => next.add(id))
      }
      return next
    })
  }, [selectedItems])

  const handleTouchStart = useCallback((itemId: string, _e: React.TouchEvent) => {
    isDraggingRef.current = false
    if (selectionMode) {
      touchSelectActiveRef.current = true
      return
    }
    longPressTimerRef.current = setTimeout(() => {
      if (!isDraggingRef.current && !selectionMode) {
        setSelectedItems(new Set([itemId]))
        if (window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate(50)
        }
      }
    }, 500)
  }, [selectionMode])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    isDraggingRef.current = true
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)

    if (selectionMode && touchSelectActiveRef.current && e.touches.length === 1) {
      const touch = e.touches[0]
      const el = document.elementFromPoint(touch.clientX, touch.clientY)
      if (el) {
        const tile = el.closest('[data-media-id]') as HTMLElement | null
        if (tile) {
          const mediaId = tile.dataset.mediaId
          if (mediaId) {
            setSelectedItems(prev => {
              if (prev.has(mediaId)) return prev
              const next = new Set(prev)
              next.add(mediaId)
              return next
            })
          }
        }
      }
    }
  }, [selectionMode])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    touchSelectActiveRef.current = false
  }, [])

  return {
    selectedItems,
    selectionMode,
    toggleSelection,
    cancelSelection,
    selectAll,
    toggleGroupSelection,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  }
}
