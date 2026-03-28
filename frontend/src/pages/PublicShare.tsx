import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import Lightbox from '../components/gallery/Lightbox'
import api from '../api/client'
import ViewModeToggle, { type ViewMode } from '../components/gallery/ViewModeToggle'

export default function PublicShare() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [needsPassword, setNeedsPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [verifying, setVerifying] = useState(false)

  const [media, setMedia] = useState<any[]>([])
  const [shareType, setShareType] = useState<string>('')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid-medium')

  const loadShare = async (pw?: string) => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.accessShare(token, pw)
      setMedia(data.media || [])
      setShareType(data.share_type)
      setNeedsPassword(false)
    } catch (e: any) {
      if (e.message?.includes('Password') || e.message?.includes('password')) {
        setNeedsPassword(true)
      } else {
        setError(e.message || 'Không thể truy cập liên kết chia sẻ')
      }
    } finally {
      setLoading(false)
      setVerifying(false)
    }
  }

  useEffect(() => {
    loadShare()
  }, [token])

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) {
      toast.error('Vui lòng nhập mật khẩu')
      return
    }
    setVerifying(true)
    loadShare(password)
  }

  if (loading) return <div className="flex h-screen items-center justify-center bg-background"><div className="spinner w-8 h-8" /></div>

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-4 text-center">
        <div className="bg-surface-container p-8 rounded-2xl max-w-md w-full shadow-lg border border-border">
          <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-[32px]">error</span>
          </div>
          <h2 className="text-xl font-bold mb-2 text-on-surface">Không thể truy cập</h2>
          <p className="text-on-surface-variant text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (needsPassword) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-4">
        <form onSubmit={handlePasswordSubmit} className="bg-surface-container-high p-8 rounded-3xl max-w-sm w-full shadow-xl border border-border">
          <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock size={28} />
          </div>
          <h2 className="text-2xl font-bold text-center mb-2 text-on-surface font-headline">Yêu cầu bảo mật</h2>
          <p className="text-on-surface-variant text-center text-sm mb-8">Liên kết này được bảo vệ bằng mật khẩu. Vui lòng nhập mật khẩu để tiếp tục.</p>
          
          <div className="form-group mb-6">
            <input 
              type="password" 
              className="form-input bg-surface-container w-full" 
              placeholder="Nhập mật khẩu..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={verifying}
              autoFocus
            />
          </div>
          
          <button 
            type="submit" 
            className="btn btn-primary w-full py-3"
            disabled={verifying}
          >
            {verifying ? <div className="spinner w-5 h-5 mx-auto" /> : 'Mở khóa'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Logo" className="h-9 w-9 object-contain" />
            <div className="flex flex-col translate-y-0.5">
              <span className="text-lg font-bold font-headline tracking-tight leading-none flex items-center">
                <span className="text-slate-500 dark:text-slate-400">My</span>
                <span className="text-blue-500 dark:text-blue-500">Cloud</span>
                <span className="text-orange-500 dark:text-orange-500">X</span>
                <span className="text-slate-700 dark:text-slate-300 ml-1.5 font-semibold">Share</span>
              </span>
            </div>
          </div>
          <div className="text-sm font-medium text-on-surface-variant bg-surface-container-high px-3 py-1.5 rounded-full flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            {media.length} mục
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold font-headline mb-2">Thư viện chia sẻ</h1>
            <p className="text-on-surface-variant">Bạn đang xem {shareType === 'album' ? 'một album được chia sẻ' : 'các tệp được chia sẻ'}</p>
          </div>
          
          <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
        </div>

        {media.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-surface-container-low rounded-3xl border border-dashed border-border">
            <span className="material-symbols-outlined text-[64px] text-on-surface-variant opacity-50 mb-4">photo_library</span>
            <p className="text-lg font-medium text-on-surface">Thư viện trống</p>
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
      </main>

      {/* Lightbox */}
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
