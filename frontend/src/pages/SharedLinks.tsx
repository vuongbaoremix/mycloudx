import { useState, useEffect } from 'react'
import { Link2, Trash2, Copy, Clock, Eye, Lock } from 'lucide-react'
import { toast } from 'sonner'
import api from '../api/client'
import { SkeletonSharedLinks } from '../components/ui/Skeleton'

export default function SharedLinks() {
  const [shares, setShares] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    api.listShares().then((data) => {
      setShares(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa liên kết chia sẻ này?')) return
    try {
      await api.deleteShare(id)
      setShares((prev) => prev.filter((s) => s.id !== id))
      toast.success('Đã xóa liên kết chia sẻ')
    } catch (e: any) {
      toast.error('Lỗi khi xóa: ' + (e.message || ''))
    }
  }

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/s/${token}`
    navigator.clipboard.writeText(url)
    toast.success('Đã copy link chia sẻ!')
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  if (loading) return <SkeletonSharedLinks />

  return (
    <div className="gallery-container">
      <h1 className="text-2xl font-extrabold font-headline text-on-surface tracking-tight mb-6 flex items-center gap-2">
        <Link2 size={20} className="text-primary" />
        Liên kết chia sẻ
      </h1>

      {shares.length === 0 ? (
        <div className="empty-state">
          <Link2 size={64} className="empty-state-icon" />
          <h3>Chưa có liên kết chia sẻ nào</h3>
          <p>Chia sẻ ảnh từ thư viện hoặc album</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {shares.map((share) => (
            <div key={share.id} className="card flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Link2 size={22} color="var(--accent)" />
              </div>

              <div className="flex-1">
                <div className="font-medium text-sm text-on-surface">
                  {share.media_count} ảnh · {share.share_type}
                </div>
                <div className="text-sm text-muted flex items-center gap-3">
                  <span><Eye size={12} /> {share.view_count} lượt xem</span>
                  {share.has_password && <span><Lock size={12} /> Có mật khẩu</span>}
                  {share.expires_at && <span><Clock size={12} /> {new Date(share.expires_at).toLocaleDateString()}</span>}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  className="btn btn-secondary !px-3 !py-1.5 !text-xs"
                  onClick={() => copyLink(share.token)}
                >
                  <Copy size={14} />
                  {copied === share.token ? 'Đã copy!' : 'Copy link'}
                </button>
                <button className="btn btn-ghost text-danger" onClick={() => handleDelete(share.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
