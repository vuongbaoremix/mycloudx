import { useState, useEffect } from 'react'
import {
  Shield, Users, HardDrive, Image, FolderOpen,
  Trash2, KeyRound,
} from 'lucide-react'
import api from '../api/client'
import { SkeletonAdmin } from '../components/ui/Skeleton'
import { useConfirm } from '../contexts/ConfirmContext'

export default function Admin() {
  const [stats, setStats] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    Promise.all([api.getStats(), api.listUsers()])
      .then(([s, u]) => { setStats(s); setUsers(u); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
    return `${(bytes / 1073741824).toFixed(1)} GB`
  }

  const { confirm } = useConfirm()

  const handleResetPassword = async (userId: string, userName: string) => {
    if (!await confirm({
      title: 'Reset mật khẩu',
      message: `Bạn có muốn cấp lại mật khẩu cho user ${userName}?`,
      confirmText: 'Reset'
    })) return
    const result = await api.resetUserPassword(userId)
    setMessage(`Mật khẩu mới cho ${userName}: ${result.new_password}`)
    setTimeout(() => setMessage(''), 10000)
  }

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!await confirm({
      title: 'Xóa người dùng',
      message: `Toàn bộ dữ liệu của ${userName} sẽ bị xóa vĩnh viễn và không thể khôi phục. Bạn có chắc chắn?`,
      confirmText: 'Xóa Vĩnh Viễn',
      isDestructive: true
    })) return
    await api.deleteUser(userId)
    setUsers((prev) => prev.filter((u) => u.id !== userId))
  }

  const handleRoleToggle = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    const updated = await api.updateUser(userId, { role: newRole })
    setUsers((prev) => prev.map((u) => u.id === userId ? updated : u))
  }

  if (loading) return <SkeletonAdmin />

  return (
    <div className="gallery-container">
      <h1 className="text-2xl font-extrabold font-headline text-on-surface tracking-tight mb-6 flex items-center gap-2">
        <Shield size={20} className="text-primary" />
        Quản trị
      </h1>

      {message && <div className="text-success text-sm mb-4 px-3 py-2 bg-success/10 rounded-lg">{message}</div>}

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Users, label: 'Users', value: stats.total_users, color: '#6366f1' },
            { icon: Image, label: 'Media', value: stats.total_media.toLocaleString(), color: '#22c55e' },
            { icon: HardDrive, label: 'Storage', value: formatBytes(stats.total_storage_bytes), color: '#f59e0b' },
            { icon: FolderOpen, label: 'Albums', value: stats.total_albums, color: '#ef4444' },
          ].map((stat) => (
            <div key={stat.label} className="card flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg flex items-center justify-center" style={{ background: `${stat.color}15` }}>
                <stat.icon size={22} color={stat.color} />
              </div>
              <div>
                <div className="text-sm text-on-surface-variant">{stat.label}</div>
                <div className="text-2xl font-bold text-on-surface">{stat.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* User table */}
      <h3 className="text-base font-semibold text-on-surface mb-4">Danh sách User</h3>
      <div className="card !p-0 overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/30 text-left">
              <th className="py-3 px-4 text-on-surface-variant font-medium">Tên</th>
              <th className="py-3 px-4 text-on-surface-variant font-medium">Email</th>
              <th className="py-3 px-4 text-on-surface-variant font-medium">Role</th>
              <th className="py-3 px-4 text-on-surface-variant font-medium">Storage</th>
              <th className="py-3 px-4 text-on-surface-variant font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-outline-variant/20">
                <td className="py-2.5 px-4 font-medium text-on-surface">{user.name}</td>
                <td className="py-2.5 px-4 text-on-surface-variant">{user.email}</td>
                <td className="py-2.5 px-4">
                  <button
                    className={`btn ${user.role === 'admin' ? 'btn-primary' : 'btn-secondary'} !px-2.5 !py-0.5 !text-xs`}
                    onClick={() => handleRoleToggle(user.id, user.role)}
                  >
                    {user.role}
                  </button>
                </td>
                <td className="py-2.5 px-4 text-on-surface-variant">
                  {formatBytes(user.storage_used || 0)}
                </td>
                <td className="py-2.5 px-4">
                  <div className="flex gap-2">
                    <button className="btn btn-ghost" title="Reset mật khẩu" onClick={() => handleResetPassword(user.id, user.name)}>
                      <KeyRound size={14} />
                    </button>
                    <button className="btn btn-ghost" title="Xóa user" onClick={() => handleDeleteUser(user.id, user.name)} style={{ color: 'var(--danger)' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
