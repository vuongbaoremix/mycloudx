import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Images } from 'lucide-react'
import api from '../api/client'
import { SkeletonAlbumGrid } from '../components/ui/Skeleton'
import { useConfirm } from '../contexts/ConfirmContext'

export default function Albums() {
  const navigate = useNavigate()
  const [albums, setAlbums] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  useEffect(() => {
    api.listAlbums().then((data) => {
      setAlbums(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    const album = await api.createAlbum(newName, newDesc || undefined)
    setAlbums((prev) => [album, ...prev])
    setNewName('')
    setNewDesc('')
    setShowCreate(false)
  }

  const { confirm } = useConfirm()

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!await confirm({
      title: 'Xóa Album',
      message: 'Bạn có chắc chắn muốn xóa album này? Việc này không xóa ảnh gốc trong thư viện.',
      confirmText: 'Xóa',
      isDestructive: true
    })) return
    await api.deleteAlbum(id)
    setAlbums((prev) => prev.filter((a) => a.id !== id))
  }

  // Simple deterministic gradient color based on album ID
  const getGradientForId = (id: string) => {
    const gradients = [
      'from-blue-200 to-indigo-500',
      'from-emerald-200 to-teal-500',
      'from-amber-200 to-orange-400',
      'from-rose-300 to-pink-500',
      'from-purple-300 to-fuchsia-500',
      'from-cyan-200 to-blue-500',
      'from-lime-200 to-emerald-500',
      'from-orange-200 to-rose-400'
    ]
    let hash = 0
    for(let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash)
    }
    return gradients[Math.abs(hash) % gradients.length]
  }

  if (loading) return <SkeletonAlbumGrid count={8} />

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-16">
      
      {/* Header */}
      <div className="mb-8 md:mb-12">
        <h1 className="text-3xl md:text-5xl font-extrabold font-headline text-slate-900 dark:text-white tracking-tight mb-1.5 md:mb-2">Album của tôi</h1>
        <p className="text-base md:text-xl text-slate-500 dark:text-slate-400 font-medium">Câu chuyện của bạn, được sắp xếp gọn gàng.</p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-8 md:gap-12">
        
        {/* Create New Album Card */}
        <div 
          onClick={() => setShowCreate(true)}
          className="group relative aspect-square rounded-[1.5rem] sm:rounded-[2.5rem] border-[3px] border-dashed border-blue-200/60 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/5 hover:bg-blue-100/50 dark:hover:bg-blue-500/10 transition-all cursor-pointer flex flex-col items-center justify-center shadow-sm hover:shadow-xl p-2 md:p-4 text-center"
        >
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-white dark:bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-blue-100 dark:border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 transition-transform duration-500 group-hover:scale-110 group-hover:shadow-[0_8px_30px_rgba(59,130,246,0.2)] mb-3 md:mb-4">
            <Plus className="w-6 h-6 md:w-7 md:h-7" strokeWidth={2.5} />
          </div>
          <span className="text-blue-700 dark:text-blue-400 font-semibold tracking-tight text-[13px] md:text-lg px-2 leading-tight">Tạo Album mới</span>
        </div>

        {/* Existing Albums (My Albums) */}
        {albums.filter(a => !a.is_shared).map((album) => {
          const grad = getGradientForId(album.id)
          const preview = album.preview_media || []
          const hasPreview = preview.length > 0
          
          const coverSrc = hasPreview ? (preview[0]?.thumbnails?.large || preview[0]?.thumbnails?.medium || preview[0]?.thumbnails?.small) : null
          const middleSrc = preview.length > 1 ? (preview[1]?.thumbnails?.medium || preview[1]?.thumbnails?.small) : null
          const backSrc = preview.length > 2 ? (preview[2]?.thumbnails?.medium || preview[2]?.thumbnails?.small) : null

          return (
            <div 
              key={album.id} 
              className="group cursor-pointer flex flex-col pt-2 md:pt-4"
              onClick={() => navigate(`/albums/${album.id}`)}
            >
              {/* Stacked Cards Layout */}
              <div className="relative aspect-square mb-3 md:mb-5 w-full">
                {/* Bottom layer */}
                <div className={`absolute inset-0 bg-surface-container rounded-[1.5rem] sm:rounded-[2.5rem] overflow-hidden 
                                shadow-sm transition-transform duration-500 ease-out 
                                group-hover:translate-x-4 sm:group-hover:translate-x-6 group-hover:-translate-y-2 sm:group-hover:-translate-y-4 group-hover:rotate-6 origin-bottom-left ${!backSrc ? 'mix-blend-multiply opacity-60' : ''}`}>
                   {backSrc && <img src={backSrc} alt="" className="w-full h-full object-cover opacity-60 dark:opacity-40 filter brightness-75 transition-transform duration-700 group-hover:scale-110" />}
                </div>
                
                {/* Middle layer */}
                <div className={`absolute inset-0 bg-surface-container-high rounded-[1.5rem] sm:rounded-[2.5rem] overflow-hidden 
                                shadow-md transition-transform duration-500 ease-out 
                                group-hover:-translate-x-3 sm:group-hover:-translate-x-5 group-hover:-translate-y-1 sm:group-hover:-translate-y-2 group-hover:-rotate-3 origin-bottom-right z-10 ${!middleSrc ? 'mix-blend-multiply opacity-80' : ''}`}>
                   {middleSrc && <img src={middleSrc} alt="" className="w-full h-full object-cover opacity-80 dark:opacity-60 filter brightness-90 transition-transform duration-700 group-hover:scale-110" />}
                </div>
                
                {/* Front layer (Main cover) */}
                <div className={`absolute inset-0 z-20 rounded-[1.5rem] sm:rounded-[2.5rem] shadow-[0_10px_40px_rgba(0,0,0,0.12)] 
                                overflow-hidden transition-transform duration-500 ease-out group-hover:-translate-y-1 sm:group-hover:-translate-y-2 
                                ${hasPreview ? 'bg-surface' : 'bg-gradient-to-br ' + grad} flex items-center justify-center border-2 sm:border-4 border-white/40 dark:border-white/10`}
                >
                  {coverSrc ? (
                    <img src={coverSrc} alt={album.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  ) : (
                    <Images className="w-10 h-10 sm:w-16 sm:h-16 text-white/40 mix-blend-overlay drop-shadow-md" />
                  )}
                  
                  {/* Delete button (only visible on hover over main layer) */}
                  <div className="absolute top-3 right-3 sm:top-4 sm:right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button
                      className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/20 hover:bg-red-500/90 backdrop-blur-md text-white flex items-center justify-center shadow-lg transition-colors border border-white/20"
                      onClick={(e) => handleDelete(album.id, e)}
                      title="Xóa Album"
                    >
                      <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Album Details */}
              <div className="px-1 sm:px-2">
                <h3 className="text-sm sm:text-xl font-bold font-headline text-on-surface mb-0.5 sm:mb-1.5 truncate transition-colors group-hover:text-primary">
                  {album.name}
                </h3>
                <div className="flex items-center text-[11px] sm:text-sm font-semibold text-on-surface-variant tracking-wide">
                  <Images className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1.5 opacity-70" /> 
                  {album.media_count} mục
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Shared Albums Section */}
      {albums.some(a => a.is_shared) && (
        <>
          <div className="mt-16 md:mt-24 mb-8 md:mb-12">
            <h1 className="text-3xl md:text-5xl font-extrabold font-headline text-slate-900 dark:text-white tracking-tight mb-1.5 md:mb-2">Được chia sẻ với tôi</h1>
            <p className="text-base md:text-xl text-slate-500 dark:text-slate-400 font-medium">Khoảnh khắc từ bạn bè và người thân.</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-8 md:gap-12">
            {albums.filter(a => a.is_shared).map((album) => {
              const grad = getGradientForId(album.id)
              const preview = album.preview_media || []
              const hasPreview = preview.length > 0
              
              const coverSrc = hasPreview ? (preview[0]?.thumbnails?.large || preview[0]?.thumbnails?.medium || preview[0]?.thumbnails?.small) : null
              const middleSrc = preview.length > 1 ? (preview[1]?.thumbnails?.medium || preview[1]?.thumbnails?.small) : null
              const backSrc = preview.length > 2 ? (preview[2]?.thumbnails?.medium || preview[2]?.thumbnails?.small) : null

              return (
                <div 
                  key={album.id} 
                  className="group cursor-pointer flex flex-col pt-2 md:pt-4"
                  onClick={() => navigate(`/albums/${album.id}`)}
                >
                  {/* Stacked Cards Layout */}
                  <div className="relative aspect-square mb-3 md:mb-5 w-full">
                    {/* Bottom layer */}
                    <div className={`absolute inset-0 bg-surface-container rounded-[1.5rem] sm:rounded-[2.5rem] overflow-hidden 
                                    shadow-sm transition-transform duration-500 ease-out 
                                    group-hover:translate-x-4 sm:group-hover:translate-x-6 group-hover:-translate-y-2 sm:group-hover:-translate-y-4 group-hover:rotate-6 origin-bottom-left ${!backSrc ? 'mix-blend-multiply opacity-60' : ''}`}>
                      {backSrc && <img src={backSrc} alt="" className="w-full h-full object-cover opacity-60 dark:opacity-40 filter brightness-75 transition-transform duration-700 group-hover:scale-110" />}
                    </div>
                    
                    {/* Middle layer */}
                    <div className={`absolute inset-0 bg-surface-container-high rounded-[1.5rem] sm:rounded-[2.5rem] overflow-hidden 
                                    shadow-md transition-transform duration-500 ease-out 
                                    group-hover:-translate-x-3 sm:group-hover:-translate-x-5 group-hover:-translate-y-1 sm:group-hover:-translate-y-2 group-hover:-rotate-3 origin-bottom-right z-10 ${!middleSrc ? 'mix-blend-multiply opacity-80' : ''}`}>
                      {middleSrc && <img src={middleSrc} alt="" className="w-full h-full object-cover opacity-80 dark:opacity-60 filter brightness-90 transition-transform duration-700 group-hover:scale-110" />}
                    </div>
                    
                    {/* Front layer (Main cover) */}
                    <div className={`absolute inset-0 z-20 rounded-[1.5rem] sm:rounded-[2.5rem] shadow-[0_10px_40px_rgba(0,0,0,0.12)] 
                                    overflow-hidden transition-transform duration-500 ease-out group-hover:-translate-y-1 sm:group-hover:-translate-y-2 
                                    ${hasPreview ? 'bg-surface' : 'bg-gradient-to-br ' + grad} flex items-center justify-center border-2 sm:border-4 border-white/40 dark:border-white/10`}
                    >
                      {coverSrc ? (
                        <img src={coverSrc} alt={album.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                      ) : (
                        <Images className="w-10 h-10 sm:w-16 sm:h-16 text-white/40 mix-blend-overlay drop-shadow-md" />
                      )}
                    </div>
                  </div>

                  {/* Album Details */}
                  <div className="px-1 sm:px-2">
                    <h3 className="text-sm sm:text-xl font-bold font-headline text-on-surface mb-0.5 sm:mb-1.5 truncate transition-colors group-hover:text-primary">
                      {album.name}
                    </h3>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center text-[11px] sm:text-sm font-semibold text-on-surface-variant tracking-wide">
                        <Images className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1.5 opacity-70" /> 
                        {album.media_count} mục
                      </div>
                      <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">
                        Từ {album.owner_name}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-surface rounded-3xl p-8 w-full max-w-md shadow-2xl border border-white/10 animate-slideUp">
            <h3 className="text-2xl font-bold font-headline mb-6 text-on-surface tracking-tight">Tạo Album mới</h3>
            
            <div className="space-y-5">
              <div className="form-group">
                <label className="form-label text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2">Tên Album</label>
                <input 
                  className="form-input bg-surface-container" 
                  value={newName} 
                  onChange={(e) => setNewName(e.target.value)} 
                  placeholder="Ví dụ: Chuyến du lịch hè 2024" 
                  autoFocus 
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <div className="form-group">
                <label className="form-label text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2">Mô tả</label>
                <textarea 
                  className="form-input bg-surface-container resize-none h-24" 
                  value={newDesc} 
                  onChange={(e) => setNewDesc(e.target.value)} 
                  placeholder="Ghi chú tùy chọn..." 
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <button className="btn btn-secondary px-6" onClick={() => setShowCreate(false)}>Hủy</button>
              <button className="btn btn-primary px-6" onClick={handleCreate} disabled={!newName.trim()}>Tạo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
