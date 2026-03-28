
interface SelectionActionBarProps {
  selectedItems: Set<string>
  mediaCount: number
  cancelSelection: () => void
  selectAll: () => void
  onMultiDelete: () => void
  onOpenAlbumModal: () => void
  onOpenShareModal: () => void
}

export default function SelectionActionBar({
  selectedItems, mediaCount, cancelSelection, selectAll,
  onMultiDelete, onOpenAlbumModal, onOpenShareModal,
}: SelectionActionBarProps) {
  if (selectedItems.size === 0) return null

  return (
    <div className="fixed bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 z-50 w-[95%] sm:w-auto animate-slideUpSpring">
      <div className="bg-surface-container-high/90 backdrop-blur-xl px-4 sm:px-6 py-3 rounded-full shadow-2xl border border-outline-variant/10 flex items-center justify-between sm:justify-center gap-2 sm:gap-4 overflow-x-auto">
        <span className="text-sm font-bold text-on-surface mr-1 sm:mr-2 whitespace-nowrap">{selectedItems.size} đã chọn</span>

        {/* Select All button */}
        <button
          className="p-2 bg-surface hover:bg-surface-container rounded-full text-primary transition-colors tooltip flex items-center justify-center"
          title={selectedItems.size === mediaCount ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
          onClick={() => selectedItems.size === mediaCount ? cancelSelection() : selectAll()}
        >
          <span className="material-symbols-outlined text-[20px]" data-icon="select_all">
            {selectedItems.size === mediaCount ? 'deselect' : 'select_all'}
          </span>
        </button>
        <div className="w-px h-6 bg-border mx-1"></div>
        <button className="p-2 bg-surface hover:bg-surface-container rounded-full text-primary transition-colors tooltip flex items-center justify-center" title="Thêm vào Album" onClick={onOpenAlbumModal}>
          <span className="material-symbols-outlined text-[20px]" data-icon="library_add">library_add</span>
        </button>
        <button className="p-2 bg-surface hover:bg-surface-container rounded-full text-primary transition-colors tooltip flex items-center justify-center" title="Chia sẻ" onClick={onOpenShareModal}>
          <span className="material-symbols-outlined text-[20px]" data-icon="share">share</span>
        </button>
        <div className="w-px h-6 bg-border mx-1"></div>
        <button
          className="p-2 bg-error-container hover:bg-error text-on-error-container hover:text-white rounded-full transition-colors tooltip flex items-center justify-center"
          title="Xóa đã chọn"
          onClick={onMultiDelete}
        >
          <span className="material-symbols-outlined text-[20px]" data-icon="delete">delete</span>
        </button>
        <div className="w-px h-6 bg-border mx-1"></div>
        <button className="p-2 text-on-surface-variant hover:text-on-surface flex items-center justify-center" onClick={cancelSelection}>
          <span className="material-symbols-outlined text-[20px]" data-icon="close">close</span>
        </button>
      </div>
    </div>
  )
}
