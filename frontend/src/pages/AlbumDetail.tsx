import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Share2, X } from 'lucide-react'
import { toast } from 'sonner'
import api from '../api/client'
import Lightbox from '../components/gallery/Lightbox'
import ViewModeToggle, { type ViewMode } from '../components/gallery/ViewModeToggle'
import { SkeletonAlbumDetail } from '../components/ui/Skeleton'


export default function AlbumDetail() {
  const { id } = useParams<{ id: string }>()
  const [albumData, setAlbumData] = useState<any>(null)
  const [album, setAlbum] = useState<any>(null)
  const [media, setMedia] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid-medium')

  const [showShareModal, setShowShareModal] = useState(false)
  const [shareOptions, setShareOptions] = useState({ expires_hours: '', max_views: '' })
  const [shareLink, setShareLink] = useState('')

  const [collabQuery, setCollabQuery] = useState('')
  const [collabRole, setCollabRole] = useState('viewer')
  const [collabDl, setCollabDl] = useState(false)
  const [searchUsers, setSearchUsers] = useState<any[]>([])
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    if (collabQuery.length < 2) {
      setSearchUsers([])
      setShowDropdown(false)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchUsers(collabQuery)
        setSearchUsers(res)
        if (res.length > 0) setShowDropdown(true)
      } catch (e) {}
    }, 300)
    return () => clearTimeout(timer)
  }, [collabQuery])

  useEffect(() => {
    if (!id) return
    api.getAlbum(id).then((data) => {
      setAlbumData(data)
      setAlbum(data.album)
      setMedia(data.media)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  const handleRemoveMedia = async (mediaId: string) => {
    if (!id) return
    try {
      await api.removeMediaFromAlbum(id, [mediaId])
      setMedia((prev) => prev.filter((m) => m.id !== mediaId))
      setAlbum((prev: any) => prev ? { ...prev, media_count: prev.media_count - 1 } : prev)
      toast.success('Đã xóa khỏi album')
    } catch {
      toast.error('Không thể xóa khỏi album')
    }
  }

  const handleOpenShareModal = () => {
    setShareOptions({ expires_hours: '', max_views: '' })
    setShareLink('')
    setShowShareModal(true)
  }

  const handleShareAlbum = async () => {
    try {
      const opts: any = { album_id: id }
      if (shareOptions.expires_hours) opts.expires_hours = parseInt(shareOptions.expires_hours)
      if (shareOptions.max_views) opts.max_views = parseInt(shareOptions.max_views)
      const share = await api.createShare([], opts)
      setShareLink(`${window.location.origin}/s/${share.token}`)
    } catch (e) {
      console.error(e)
    }
  }

  if (loading) return <SkeletonAlbumDetail />
  if (!album) return <div className="empty-state"><h3>Album không tồn tại</h3></div>

  return (
    <div className="gallery-container">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/albums" className="btn btn-ghost"><ArrowLeft size={18} /></Link>
        <div>
          <h1 className="text-2xl font-extrabold font-headline text-on-surface tracking-tight">{album?.name || 'Album'}</h1>
          {album.description && <p className="text-sm text-muted">{album.description}</p>}
        </div>
        <div className="flex items-center gap-4 ml-auto">
          <span className="text-sm text-muted">
            {album.media_count} ảnh
          </span>
          {albumData?.role !== 'viewer' && (
            <button className="btn btn-secondary flex items-center gap-2" onClick={handleOpenShareModal}>
              <Share2 size={16} /> Chia sẻ
            </button>
          )}
        </div>
      </div>

      {/* View Mode Controls */}
      {media.length > 0 && (
        <div className="flex justify-end mb-6">
          <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
        </div>
      )}

      {media.length === 0 ? (
        <div className="empty-state">
          <Plus size={64} className="empty-state-icon" />
          <h3>Album trống</h3>
          <p>Thêm ảnh vào album từ thư viện</p>
        </div>
      ) : (
        <div className={`grid grid-cols-12 ${viewMode === 'grid-large' ? 'gap-px md:gap-6' : viewMode === 'grid-medium' ? 'gap-px md:gap-4' : 'gap-px md:gap-2'}`}>
          {media.map((item, index) => {
            let colSpan = "col-span-4 sm:col-span-4 md:col-span-4 lg:col-span-4 xl:col-span-3 aspect-square"
            if (viewMode === 'grid-medium') {
              colSpan = "col-span-3 sm:col-span-3 md:col-span-3 lg:col-span-3 xl:col-span-2 aspect-square"
            } else if (viewMode === 'grid-small') {
              colSpan = "col-span-2 sm:col-span-2 md:col-span-2 lg:col-span-2 xl:col-span-1 aspect-square"
            }

            let thumbSrc = item.thumbnails?.medium || item.thumbnails?.small || item.thumbnails?.micro;
            if (viewMode === 'grid-small') thumbSrc = item.thumbnails?.small || item.thumbnails?.medium;
            else if (viewMode === 'grid-large') thumbSrc = item.thumbnails?.large || item.thumbnails?.medium || item.thumbnails?.small || item.thumbnails?.micro;

            const isVideo = item.mime_type?.startsWith('video/')
            if (!thumbSrc && isVideo) thumbSrc = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiPjwvc3ZnPg==';
            
            return (
              <div
                key={item.id}
                className={`${colSpan} relative group rounded-none md:rounded-xl overflow-hidden cursor-pointer bg-surface-container-high shadow-none md:shadow-xl md:shadow-on-surface/5 transition-all`}
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

                {/* Remove from album button */}
                {albumData?.role === 'owner' && (
                  <button
                    className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 hover:bg-red-500 text-white/80 hover:text-white opacity-0 group-hover:opacity-100 transition-all z-10 backdrop-blur-sm"
                    onClick={(e) => { e.stopPropagation(); handleRemoveMedia(item.id) }}
                    title="Xóa khỏi album"
                  >
                    <X size={16} />
                  </button>
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
          onDelete={(mediaId) => {
            handleRemoveMedia(mediaId)
            // Navigate to next/prev or close if last item
            if (media.length <= 1) {
              setLightboxIndex(null)
            } else if (lightboxIndex >= media.length - 1) {
              setLightboxIndex(lightboxIndex - 1)
            }
          }}
        />
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-surface rounded-3xl p-8 w-full max-w-md shadow-2xl border border-outline-variant/10 animate-slideUpSpring">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-2xl font-bold font-headline text-on-surface tracking-tight">Chia sẻ Album</h3>
               <button className="btn btn-ghost p-2" onClick={() => setShowShareModal(false)}><X size={20}/></button>
            </div>
            
            {!shareLink ? (
              <div className="space-y-5">
                {albumData?.role === 'owner' && (
                  <div className="bg-primary/5 p-4 rounded-2xl flex-col items-start gap-4 mb-4">
                      <p className="text-sm font-semibold mb-2">Thêm người dùng trực tiếp</p>
                      <div className="flex gap-2 w-full relative">
                          <div className="flex-1 relative">
                              <input 
                                  className="form-input w-full bg-surface-container" 
                                  placeholder="Tên hoặc Email..." 
                                  value={collabQuery}
                                  onChange={(e) => setCollabQuery(e.target.value)}
                                  onFocus={() => { if (searchUsers.length > 0) setShowDropdown(true) }}
                                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                                  autoComplete="off"
                              />
                              {showDropdown && searchUsers.length > 0 && (
                                  <div className="absolute top-full left-0 right-0 mt-1 bg-surface-container-high rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto border border-outline-variant/10">
                                      {searchUsers.map(u => (
                                          <div 
                                              key={u.id} 
                                              className="p-2 hover:bg-primary/10 cursor-pointer flex items-center gap-2 transition-colors"
                                              onClick={() => {
                                                  setCollabQuery(u.email)
                                                  setShowDropdown(false)
                                              }}
                                          >
                                              <div className="w-8 h-8 rounded-full bg-primary/20 flex flex-shrink-0 items-center justify-center text-primary font-bold overflow-hidden text-xs">
                                                  {u.avatar ? <img src={u.avatar} className="w-full h-full object-cover" /> : u.name?.charAt(0).toUpperCase()}
                                              </div>
                                              <div className="flex flex-col truncate">
                                                  <span className="text-sm font-bold text-on-surface truncate">{u.name}</span>
                                                  <span className="text-xs text-on-surface-variant truncate">{u.email}</span>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                          <select className="form-input bg-surface-container w-32" value={collabRole} onChange={(e) => setCollabRole(e.target.value)}>
                              <option value="viewer">Chỉ xem</option>
                              <option value="contributor">Đóng góp</option>
                          </select>
                      </div>
                      <div className="mt-2 text-xs flex gap-2 items-center">
                          <input type="checkbox" id="collab-dl" checked={collabDl} onChange={(e) => setCollabDl(e.target.checked)} />
                          <label htmlFor="collab-dl">Cho phép tải xuống</label>
                      </div>
                      <button className="btn btn-primary mt-3 w-full" onClick={async () => {
                          if (!collabQuery) return toast.error('Thiếu thông tin người dùng');
                          try {
                              await api.addCollaborator(id!, collabQuery, collabRole, collabDl);
                              toast.success('Đã thêm người dùng');
                              setCollabQuery('');
                              api.getAlbum(id!).then(d => { setAlbumData(d); setAlbum(d.album); });
                          } catch (e) {
                              toast.error('Lỗi khi thêm người dùng, hoặc người dùng không tồn tại');
                          }
                      }}>Mời tham gia</button>
                      
                      {albumData?.collaborators?.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-outline-variant/30 w-full space-y-2 max-h-32 overflow-y-auto">
                              <p className="text-xs font-semibold mb-2 text-on-surface-variant">Người đóng góp hiện tại:</p>
                              {albumData.collaborators.map((c: any) => (
                                  <div key={c.user_id} className="flex justify-between items-center text-xs bg-surface-container rounded-lg p-2">
                                      <div className="flex flex-col truncate pr-2">
                                          <span className="font-bold truncate">{c.name}</span>
                                          <span className="text-[10px] text-on-surface-variant">{c.role === 'viewer' ? 'Chỉ xem' : 'Đóng góp'} {c.can_download ? '(Được tải)' : ''}</span>
                                      </div>
                                      <button className="text-error/80 hover:text-error" onClick={async () => {
                                          if (window.confirm('Xóa quyền truy cập?')) {
                                              await api.removeCollaborator(id!, c.user_id);
                                              api.getAlbum(id!).then(d => setAlbumData(d));
                                          }
                                      }}>
                                          <X size={14} />
                                      </button>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
                )}
                
                <h4 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2">Hoặc tạo link công khai</h4>

                <div className="form-group">
                  <label className="form-label text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2">Giới hạn thời gian (giờ)</label>
                  <input 
                    type="number" 
                    className="form-input bg-surface-container" 
                    placeholder="Không giới hạn"
                    value={shareOptions.expires_hours}
                    onChange={(e) => setShareOptions(prev => ({ ...prev, expires_hours: e.target.value }))}
                  />
                  <p className="text-xs text-on-surface-variant mt-1">Để trống nếu không muốn giới hạn thời gian.</p>
                </div>
                <div className="form-group">
                  <label className="form-label text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2">Giới hạn số lượt xem</label>
                  <input 
                    type="number" 
                    className="form-input bg-surface-container" 
                    placeholder="Không giới hạn"
                    value={shareOptions.max_views}
                    onChange={(e) => setShareOptions(prev => ({ ...prev, max_views: e.target.value }))}
                  />
                  <p className="text-xs text-on-surface-variant mt-1">Để trống nếu không muốn giới hạn lượt xem.</p>
                </div>
                
                <div className="flex gap-3 justify-end mt-8">
                  <button className="btn btn-secondary px-6" onClick={() => setShowShareModal(false)}>Hủy</button>
                  <button className="btn btn-primary px-6" onClick={handleShareAlbum}>Tạo Link Mới</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm font-medium text-success flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  Đã tạo link chia sẻ thành công!
                </p>
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={shareLink} 
                    className="form-input bg-surface-container flex-1"
                  />
                  <button 
                    className="btn btn-primary"
                    onClick={() => {
                      navigator.clipboard.writeText(shareLink)
                      toast.success("Đã copy link chia sẻ!")
                    }}
                  >
                    Copy
                  </button>
                </div>
                <div className="flex justify-end mt-4">
                  <button className="btn btn-secondary px-6" onClick={() => setShowShareModal(false)}>Đóng</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
