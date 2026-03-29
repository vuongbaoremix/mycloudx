import { useState } from 'react'
import { toast } from 'sonner'
import api from '../../api/client'

interface ShareModalProps {
  selectedCount: number
  selectedItems: Set<string>
  onClose: () => void
}

export default function ShareModal({ selectedCount, selectedItems, onClose }: ShareModalProps) {
  const [shareOptions, setShareOptions] = useState({ expires_hours: '', max_views: '' })
  const [shareLink, setShareLink] = useState('')

  const handleShareSelected = async () => {
    try {
      const opts: any = {}
      if (shareOptions.expires_hours) opts.expires_hours = parseInt(shareOptions.expires_hours)
      if (shareOptions.max_views) opts.max_views = parseInt(shareOptions.max_views)
      const share = await api.createShare(Array.from(selectedItems), opts)
      setShareLink(`${window.location.origin}/s/${share.token}`)
      toast.success('Tạo link chia sẻ thành công!')
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Lỗi khi chia sẻ')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[200] flex items-end md:items-center justify-center md:p-4 animate-fadeIn">
      <div className="bg-surface rounded-t-3xl md:rounded-3xl p-6 md:p-8 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pb-8 w-full max-w-md shadow-2xl border-t md:border border-outline-variant/10 animate-slideUpSpring max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl md:text-2xl font-bold font-headline mb-4 md:mb-6 text-on-surface tracking-tight">Chia sẻ {selectedCount} ảnh</h3>

        {!shareLink ? (
          <div className="space-y-5">
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

            <div className="flex flex-col-reverse md:flex-row gap-3 justify-end mt-8">
              <button className="btn btn-secondary px-6 active:scale-95" onClick={onClose}>Hủy</button>
              <button className="btn btn-primary px-6 active:scale-95" onClick={handleShareSelected}>Tạo Link Mới</button>
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
                Sao chép
              </button>
            </div>
            <div className="flex justify-end mt-4">
              <button className="btn btn-secondary px-6" onClick={onClose}>Đóng</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
