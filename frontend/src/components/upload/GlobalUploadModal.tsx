import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react'
import { Upload, CheckCircle, AlertCircle, X, Minus, FileImage } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import api from '../../api/client'

interface UploadItem {
  id: string // stable key (uuid), not File reference
  fileName: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  result?: any
  error?: string
  previewUrl?: string
}

// Internal mutable state — mutations don't trigger re-renders, only the
// periodic flush (every 300ms) does. This prevents hundreds of setStates/sec.
type MutableItem = UploadItem

const UploadList = memo(({ items }: { items: UploadItem[] }) => {
  const listRef = useRef<HTMLDivElement>(null)
  
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 76,
    overscan: 10,
  })

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto px-3 md:px-6 pb-3 md:pb-6 relative w-full transform-gpu">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index]
          if (!item) return null
          return (
            <div
              key={item.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="pb-3"
            >
              <div className="bg-surface p-3 rounded-xl shadow-sm border border-outline-variant/10 flex items-center gap-3 h-full">
                <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center shrink-0 overflow-hidden relative">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <FileImage size={20} className="text-on-surface-variant" />
                  )}
                  {item.status === 'done' && (
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                      <div className="bg-white rounded-full">
                        <CheckCircle size={16} className="text-success" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-on-surface truncate pr-2">{item.fileName}</p>
                    {item.status === 'uploading' && <span className="text-xs font-bold text-primary">{Math.round(item.progress)}%</span>}
                  </div>
                  {item.status === 'uploading' ? (
                    <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-transform duration-300 origin-left" 
                        style={{ transform: `scaleX(${item.progress / 100})` }}
                      ></div>
                    </div>
                  ) : (
                    <p className="text-xs text-on-surface-variant font-medium">
                      {item.status === 'done'
                        ? 'Completed'
                        : item.status === 'error'
                        ? <span className="text-danger flex flex-wrap items-center gap-1 line-clamp-2" title={item.error}><AlertCircle size={12} className="shrink-0" /> {item.error || 'Failed'}</span>
                        : 'Waiting...'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {items.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-on-surface-variant pointer-events-none">
          <span className="material-symbols-outlined text-4xl mb-2 opacity-50" data-icon="inbox">inbox</span>
          <p className="text-sm font-medium">Danh sách trống</p>
        </div>
      )}
    </div>
  )
})

export default function GlobalUploadModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [items, setItems] = useState<UploadItem[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Mutable map for O(1) updates by id — avoids full-array-scan on every progress event
  const itemsMapRef = useRef<Map<string, MutableItem>>(new Map())
  // Ordered id list for rendering
  const itemIdsRef = useRef<string[]>([])
  // Dirty flag: flush to React state only when something changed
  const dirtyRef = useRef(false)

  // Periodic flush: update React state at most once per 300ms
  useEffect(() => {
    const id = setInterval(() => {
      if (!dirtyRef.current) return
      dirtyRef.current = false
      const snapshot = itemIdsRef.current.map((id) => itemsMapRef.current.get(id)!)
      setItems([...snapshot])
    }, 300)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true)
      setIsMinimized(false)
    }
    window.addEventListener('open-upload-modal', handleOpen)
    return () => window.removeEventListener('open-upload-modal', handleOpen)
  }, [])

  // Mutate item in the map and mark dirty (no React setState)
  const mutateItem = useCallback((id: string, patch: Partial<MutableItem>) => {
    const item = itemsMapRef.current.get(id)
    if (!item) return
    Object.assign(item, patch)
    dirtyRef.current = true
  }, [])

  const processQueue = useCallback(async (files: File[]) => {
    // Add new items to the mutable map
    const newIds: string[] = []
    files.forEach((file) => {
      const id = crypto.randomUUID()
      // Only create object URLs for small batches to avoid memory pressure
      const previewUrl =
        file.type.startsWith('image/') && itemIdsRef.current.length < 200
          ? URL.createObjectURL(file)
          : undefined

      itemsMapRef.current.set(id, {
        id,
        fileName: file.name,
        status: 'pending',
        progress: 0,
        previewUrl,
      })
      newIds.push(id)
    })
    itemIdsRef.current = [...itemIdsRef.current, ...newIds]
    dirtyRef.current = true
    setIsOpen(true)

    // Concurrency limit: 6 parallel uploads
    const concurrency = 6
    const queue = files.map((file, i) => ({ file, id: newIds[i] }))

    const uploadWorker = async () => {
      while (queue.length > 0) {
        const entry = queue.shift()
        if (!entry) break
        const { file, id } = entry

        mutateItem(id, { status: 'uploading', progress: 0 })

        try {
          const result = await api.uploadFile(file, undefined, ({ percent }) => {
            mutateItem(id, { progress: percent })
            // Mark dirty but don't call setItems — the timer will flush
            dirtyRef.current = true
          })

          // If the backend says the item is still processing, pass the previewUrl
          // to the gallery for an instant raw preview, and let the gallery revoke it later.
          // Otherwise, revoke it immediately.
          const existing = itemsMapRef.current.get(id)
          if (existing?.previewUrl) {
            if (result.status === 'processing') {
              result._previewUrl = existing.previewUrl;
            } else {
              URL.revokeObjectURL(existing.previewUrl)
            }
          }

          mutateItem(id, { status: 'done', progress: 100, result, previewUrl: undefined })
          window.dispatchEvent(new CustomEvent('upload-complete', { detail: result }))
        } catch (err: any) {
          const errMsg = err?.response?.data?.error || err?.message || 'Upload failed'
          mutateItem(id, { status: 'error', error: errMsg })
        }
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, files.length) }, uploadWorker)
    await Promise.all(workers)

    // Final flush after all done
    dirtyRef.current = true
  }, [mutateItem])

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const media = Array.from(files).filter((f) => {
      if (f.type.startsWith('image/') || f.type.startsWith('video/')) return true;
      const nm = f.name.toLowerCase();
      if (nm.endsWith('.heic') || nm.endsWith('.jpg') || nm.endsWith('.jpeg') || nm.endsWith('.png') || nm.endsWith('.mp4') || nm.endsWith('.mov')) return true;
      if (!f.type) return true; // Fallback for weird mobile browsers
      return false;
    });
    if (media.length > 0) processQueue(media)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const clearAll = useCallback(() => {
    // Revoke all object URLs
    itemsMapRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    })
    itemsMapRef.current.clear()
    itemIdsRef.current = []
    setItems([])
  }, [])

  const doneCount = useMemo(() => items.filter((i) => i.status === 'done').length, [items])
  const totalCount = items.length
  const percent = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100)
  const isUploading = useMemo(() => items.some((i) => i.status === 'uploading' || i.status === 'pending'), [items])

  if (!isOpen || isMinimized) {
    const isBusy = (totalCount > 0 && doneCount < totalCount) && isMinimized;
    return (
      <div 
        className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 md:bottom-10 md:right-10 z-[90] flex items-center shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer bg-gradient-to-br from-primary to-primary-container text-on-primary overflow-hidden ${isBusy ? 'rounded-full pr-6 pl-4 h-14 md:h-16 shadow-primary/40' : 'w-14 h-14 md:w-16 md:h-16 justify-center rounded-full shadow-primary/30'} upload-fab`}
        onClick={() => {
          setIsOpen(true);
          setIsMinimized(false);
          if (isBusy) {
            // Optional: small haptic feedback if busy
          } else {
            // if not busy and clicked, just trigger file selection or open the empty modal
            inputRef.current?.click()
          }
        }}
        title="Tải lên"
      >
        {isBusy ? (
          <>
            <div className="relative flex items-center justify-center mr-3 w-8 h-8 md:w-10 md:h-10 shrink-0">
               <svg className="absolute inset-0 w-full h-full text-white/20" viewBox="0 0 36 36">
                 <path className="fill-none stroke-current stroke-[3]" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
               </svg>
               <svg className="absolute inset-0 w-full h-full text-white transition-all duration-500 ease-out" viewBox="0 0 36 36" style={{ strokeDasharray: `${percent}, 100` }}>
                 <path className="fill-none stroke-current stroke-[3]" strokeLinecap="round" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
               </svg>
               <span className="material-symbols-outlined text-[16px] md:text-[20px]" data-icon="cloud_upload">cloud_upload</span>
            </div>
            <div className="flex flex-col justify-center min-w-[80px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/80 leading-tight">Đang tải</span>
              <span className="text-sm font-bold leading-tight">còn {totalCount - doneCount}</span>
            </div>
          </>
        ) : (
          <span className="material-symbols-outlined text-[28px] md:text-[32px]" data-icon="cloud_upload">cloud_upload</span>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm p-0 md:p-4">
      <div className="bg-surface w-full md:w-[900px] md:max-w-full rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slideUpSpring border border-outline-variant/10 max-h-[100dvh] md:max-h-[85vh] pb-[env(safe-area-inset-bottom)] md:pb-0">
        {/* Header */}
        <div className="p-3 md:p-6 pb-2 md:pb-4 border-b border-outline-variant/10 flex items-start justify-between">
          <div>
            <h2 className="text-base md:text-xl font-bold text-on-surface font-headline">Tải lên hàng loạt</h2>
            <p className="text-sm text-on-surface-variant mt-1">
              {totalCount > 0 ? `Đang tải ${doneCount} / ${totalCount} mục (${percent}%)` : 'Sẵn sàng tải lên'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container transition" onClick={() => setIsMinimized(true)}>
              <Minus size={20} />
            </button>
            <button className="p-2 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container transition" onClick={() => setIsOpen(false)}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Global Progress */}
        <div className="h-1 bg-surface-container w-full overflow-hidden">
          <div className="h-full bg-primary transition-transform duration-300 origin-left" style={{ transform: `scaleX(${percent / 100})` }}></div>
        </div>

        <div className="flex flex-col md:flex-row h-[calc(100dvh-120px)] md:h-[500px]">
          {/* Left panel: Dropzone */}
          <div className="flex-1 md:flex-[1.2] p-2 md:p-6 flex flex-col min-h-[25vh] md:min-h-0">
            <div
              className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-3 md:p-6 text-center transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-primary/20 bg-primary/5'}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <div className="w-12 h-12 md:w-16 md:h-16 bg-surface-container rounded-full shadow-sm flex items-center justify-center mb-3 md:mb-6">
                <div className="bg-primary text-white p-2 md:p-3 rounded-xl shadow-md rotate-[-10deg]">
                  <Upload size={20} />
                </div>
              </div>
              <h3 className="text-base md:text-lg font-bold text-on-surface mb-1 md:mb-2">Kéo thả ảnh vào đây</h3>
              <p className="text-xs md:text-sm text-on-surface-variant mb-4 md:mb-8">Hỗ trợ JPG, PNG, HEIC và RAW.</p>

              <button
                className="bg-primary hover:bg-primary-dim text-white px-6 py-2.5 rounded-full font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-105"
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
              >
                Select Files
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*,video/*,.heic,.jpg,.jpeg,.png,.mp4,.mov"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            {/* Bottom Actions */}
            <div className="mt-2 md:mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <button className="bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition">
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }} data-icon="library_add">library_add</span>
                  Add all to Album
                </button>
                <button className="bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition">
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }} data-icon="sell">sell</span>
                  Add Tags to all
                </button>
              </div>
              <button
                className="text-danger border border-danger/20 bg-danger/5 hover:bg-danger/10 px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition"
                onClick={clearAll}
              >
                <X size={16} />
                Cancel All
              </button>
            </div>
          </div>

          <div className="w-px bg-outline-variant/20 hidden md:block"></div>

          {/* Right panel: Queue */}
          <div className="flex-1 md:flex-none w-full md:w-[320px] lg:w-[380px] bg-surface-container-lowest flex flex-col border-t md:border-t-0 border-outline-variant/10 min-h-[30vh] md:min-h-0">
            <div className="p-3 md:p-6 pb-2 flex items-center justify-between">
              <h3 className="font-bold text-on-surface">Danh sách chờ</h3>
              {items.length > 0 && !isUploading && (
                <button
                  className="text-xs font-bold text-primary hover:text-primary-dim uppercase tracking-wider"
                  onClick={() => {
                    // Clear done items from map
                    itemIdsRef.current = itemIdsRef.current.filter((id) => {
                      const item = itemsMapRef.current.get(id)
                      if (item?.status === 'done') {
                        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
                        itemsMapRef.current.delete(id)
                        return false
                      }
                      return true
                    })
                    dirtyRef.current = true
                  }}
                >
                  Clear Success
                </button>
              )}
            </div>

            <UploadList items={items} />

            {/* Bottom stats */}
            <div className="p-4 border-t border-outline-variant/10 bg-surface-container-lowest flex justify-between items-center text-xs text-on-surface-variant font-medium z-10">
              <span>{totalCount > 0 ? `${totalCount - doneCount} mục đang chờ...` : 'Sẵn sàng'}</span>
              {isUploading && <span className="text-primary font-bold">Đang tải lên...</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
