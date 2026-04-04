import { useState, useEffect, useRef } from 'react'
import { Bell, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'

export default function NotificationsMenu() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const fetchNotifications = async () => {
    try {
      const data = await api.getNotifications()
      setNotifications(data)
    } catch (e) {
      console.error('Failed to fetch notifications')
    }
  }

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await api.markNotificationRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    } catch {}
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="relative" ref={menuRef}>
      <button 
        className="relative p-2 rounded-full text-on-surface-variant hover:bg-surface-container transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-error rounded-full outline outline-2 outline-surface"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-surface rounded-2xl shadow-xl border border-outline-variant/10 overflow-hidden z-50 animate-slideUpSpring">
          <div className="p-4 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
            <h3 className="font-bold font-headline">Thông báo</h3>
            {unreadCount > 0 && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{unreadCount} mới</span>}
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-on-surface-variant text-sm">
                Không có thông báo nào.
              </div>
            ) : (
              notifications.map(n => (
                <div 
                  key={n.id} 
                  className={`p-4 border-b border-outline-variant/5 hover:bg-surface-container cursor-pointer transition-colors flex gap-3 ${!n.is_read ? 'bg-primary/5' : ''}`}
                  onClick={() => {
                    setIsOpen(false)
                    if (!n.is_read) api.markNotificationRead(n.id)
                    if (n.type === 'album_invite' && n.target_id) {
                      navigate(`/albums/${n.target_id}`)
                    }
                  }}
                >
                  <div className={`w-10 h-10 rounded-full flex flex-shrink-0 items-center justify-center ${n.type === 'album_invite' ? 'bg-blue-100 text-blue-600' : 'bg-surface-container-high'}`}>
                    <span className="material-symbols-outlined text-[20px]">
                      {n.type === 'album_invite' ? 'folder_shared' : 'notifications'}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm ${!n.is_read ? 'font-bold' : 'text-on-surface-variant'}`}>{n.message}</p>
                    <p className="text-[10px] text-on-surface-variant mt-1.5 flex justify-between items-center">
                      {new Date(n.created_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                      {!n.is_read && (
                        <button 
                          className="hover:text-primary transition-colors flex items-center gap-1"
                          onClick={(e) => handleMarkAsRead(n.id, e)}
                        >
                          <Check size={12} /> Đánh dấu đã đọc
                        </button>
                      )}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
