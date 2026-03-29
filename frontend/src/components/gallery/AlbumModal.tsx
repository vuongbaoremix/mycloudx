interface AlbumModalProps {
  albums: any[]
  onAddToAlbum: (albumId: string) => void
  onClose: () => void
}

export default function AlbumModal({ albums, onAddToAlbum, onClose }: AlbumModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[200] flex items-end md:items-center justify-center md:p-4 animate-fadeIn">
      <div className="bg-surface rounded-t-3xl md:rounded-3xl p-6 md:p-8 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pb-8 w-full max-w-md shadow-2xl border-t md:border border-outline-variant/10 animate-slideUpSpring max-h-[90vh] flex flex-col">
        <h3 className="text-xl md:text-2xl font-bold font-headline mb-4 md:mb-6 text-on-surface tracking-tight">Thêm vào Album</h3>
        <div className="max-h-[60vh] overflow-y-auto space-y-2 mb-6">
          {albums.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Chưa có album nào. Vui lòng tạo album trước.</p>
          ) : (
            albums.map(album => (
              <button
                key={album.id}
                onClick={() => onAddToAlbum(album.id)}
                className="w-full text-left px-4 py-3 rounded-xl hover:bg-surface-container transition-colors flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined">folder</span>
                </div>
                <div>
                  <p className="font-semibold text-on-surface">{album.name}</p>
                  <p className="text-xs text-on-surface-variant">{album.media_count} ảnh</p>
                </div>
              </button>
            ))
          )}
        </div>
        <div className="flex justify-end pt-4 border-t border-outline-variant/10">
          <button
            className="btn btn-secondary px-6 w-full md:w-auto active:scale-95"
            onClick={onClose}
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  )
}
