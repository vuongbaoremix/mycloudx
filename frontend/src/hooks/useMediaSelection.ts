import { useState, useRef, useCallback } from 'react'
import type { MediaItem } from './useMediaData'

export function useMediaSelection(media: MediaItem[]) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const selectionMode = selectedItems.size > 0
  const lastSelectedIndexRef = useRef<number | null>(null)

  // State refs to prevent stale closures in memoized child callbacks
  const selectedItemsRef = useRef<Set<string>>(selectedItems)
  selectedItemsRef.current = selectedItems
  const mediaRef = useRef<MediaItem[]>(media)
  mediaRef.current = media

  // Touch handlers for mobile
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = useRef(false)
  const touchStartPosRef = useRef<{x: number, y: number} | null>(null)
  const dragSelectModeRef = useRef<'selecting' | 'scrolling' | 'undecided' | null>(null)
  const dragActionRef = useRef<'add' | 'remove' | null>(null)
  
  // Range selection refs
  const initialSelectedItemsRef = useRef<Set<string>>(new Set())
  const startItemIndexRef = useRef<number | null>(null)
  const lastHoverIndexRef = useRef<number | null>(null)

  const toggleSelection = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const currentIndex = mediaRef.current.findIndex(m => m.id === id)

    if (e.shiftKey && lastSelectedIndexRef.current !== null) {
      const start = Math.min(lastSelectedIndexRef.current, currentIndex)
      const end = Math.max(lastSelectedIndexRef.current, currentIndex)
      const rangeIds = mediaRef.current.slice(start, end + 1).map(m => m.id)
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
  }, [])

  const cancelSelection = useCallback(() => {
    setSelectedItems(new Set())
    lastSelectedIndexRef.current = null
  }, [])

  const selectAll = useCallback(() => {
    setSelectedItems(new Set(mediaRef.current.map(m => m.id)))
  }, [])

  const toggleGroupSelection = useCallback((groupItems: MediaItem[]) => {
    const groupIds = groupItems.map(m => m.id)
    const allSelected = groupIds.every(id => selectedItemsRef.current.has(id))
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (allSelected) {
        groupIds.forEach(id => next.delete(id))
      } else {
        groupIds.forEach(id => next.add(id))
      }
      return next
    })
  }, [])

  const handleTouchStart = useCallback((itemId: string, e: React.TouchEvent) => {
    isDraggingRef.current = false
    if (e.touches && e.touches.length > 0) {
      touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    } else {
      touchStartPosRef.current = null
    }

    const itemIndex = mediaRef.current.findIndex(m => m.id === itemId)

    if (selectionMode) {
      dragSelectModeRef.current = 'undecided'
      initialSelectedItemsRef.current = new Set(selectedItemsRef.current)
      startItemIndexRef.current = itemIndex
      lastHoverIndexRef.current = itemIndex
      
      dragActionRef.current = selectedItemsRef.current.has(itemId) ? 'remove' : 'add'
      return
    }

    longPressTimerRef.current = setTimeout(() => {
      if (!isDraggingRef.current && !selectionMode) {
        setSelectedItems(new Set([itemId]))
        dragSelectModeRef.current = 'selecting'
        dragActionRef.current = 'add'
        
        initialSelectedItemsRef.current = new Set()
        startItemIndexRef.current = itemIndex
        lastHoverIndexRef.current = itemIndex
        
        if (window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate(50)
        }
      }
    }, 500)
  }, [selectionMode])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    isDraggingRef.current = true
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)

    if (selectionMode && e.touches.length === 1) {
      const touch = e.touches[0]
      
      if (dragSelectModeRef.current === 'undecided' && touchStartPosRef.current) {
        const dx = Math.abs(touch.clientX - touchStartPosRef.current.x)
        const dy = Math.abs(touch.clientY - touchStartPosRef.current.y)
        
        if (dx > 8 || dy > 8) {
          // If predominantly horizontal, assume drag select
          if (dx > dy * 0.8) {
            dragSelectModeRef.current = 'selecting'
          } else {
            // Predominantly vertical -> semantic scrolling
            dragSelectModeRef.current = 'scrolling'
          }
        }
      }

      if (dragSelectModeRef.current === 'selecting') {
        if (e.cancelable) e.preventDefault() // Try to prevent scroll

        const el = document.elementFromPoint(touch.clientX, touch.clientY)
        if (el) {
          const tile = el.closest('[data-media-id]') as HTMLElement | null
          if (tile) {
            const mediaId = tile.dataset.mediaId
            if (mediaId) {
              const hoverIndex = mediaRef.current.findIndex(m => m.id === mediaId)
              
              if (hoverIndex !== -1 && hoverIndex !== lastHoverIndexRef.current) {
                lastHoverIndexRef.current = hoverIndex
                const startIndex = startItemIndexRef.current ?? hoverIndex
                
                const minIdx = Math.min(startIndex, hoverIndex)
                const maxIdx = Math.max(startIndex, hoverIndex)
                
                setSelectedItems(() => {
                  const next = new Set(initialSelectedItemsRef.current)
                  
                  for (let i = minIdx; i <= maxIdx; i++) {
                    const id = mediaRef.current[i].id
                    if (dragActionRef.current === 'add') {
                      next.add(id)
                    } else if (dragActionRef.current === 'remove') {
                      next.delete(id)
                    }
                  }
                  return next
                })
              }
            }
          }
        }
      }
    }
  }, [selectionMode])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    dragSelectModeRef.current = null
    touchStartPosRef.current = null
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
