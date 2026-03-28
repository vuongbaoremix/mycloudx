import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { createPortal } from 'react-dom'

interface UserProfile {
  name?: string
  email?: string
  role?: string
}

export default function AccountMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  )
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.getProfile()
      .then((p: any) => setProfile(p))
      .catch(() => {})
  }, [])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      // Don't close if clicking inside the mobile portal
      if ((e.target as Element).closest('#mobile-account-menu')) return
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen])

  const toggleTheme = () => {
    const html = document.documentElement
    if (html.classList.contains('dark')) {
      html.classList.remove('dark')
      html.classList.add('light')
      localStorage.setItem('theme', 'light')
      setIsDark(false)
    } else {
      html.classList.remove('light')
      html.classList.add('dark')
      localStorage.setItem('theme', 'dark')
      setIsDark(true)
    }
  }

  const menuItems = [
    {
      icon: isDark ? 'light_mode' : 'dark_mode',
      label: isDark ? 'Chế độ sáng' : 'Chế độ tối',
      onClick: toggleTheme,
    },
    {
      icon: 'settings',
      label: 'Cài đặt',
      onClick: () => { navigate('/settings'); setIsOpen(false) },
    },
    {
      icon: 'link',
      label: 'Liên kết chia sẻ',
      onClick: () => { navigate('/shared-links'); setIsOpen(false) },
    },
  ]

  const renderMenuContent = () => (
    <>
      {/* Drag handle (mobile) */}
      <div className="flex justify-center pt-3 pb-1 md:hidden">
        <div className="w-10 h-1 rounded-full bg-on-surface-variant/30" />
      </div>

      {/* User info header */}
      <div className="px-5 pt-4 pb-3 border-b border-outline-variant/15">
        <div className="flex items-center gap-3">
          <img
            alt="User profile"
            className="h-11 w-11 rounded-full object-cover border-2 border-surface-container-highest flex-shrink-0"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDHWf0xej2PzdHUfMqCY0A4vMVnXNx8DQz5QpbmpT6JeFy8MFpaFwArAmPhQsldHGjFB7tHH8LWHpBnxHXaf_UZ7_IC35tyR9ObIKkMEKBXytMWATGRV6XrkKJvWHap2tsX4Dh7PKbxNIj6W6XCaa7wQeBUKg_nOF7sYQysrc06vFHWyZFEN-hRGyJtMLGQ5U2FG_zs01hAWHTcXxneJZWXdGPwHb60eOtW6P8DNGivG814GXZRaxSV5LjGQ4d9Z_bH1sXtmnLGGjQ"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-on-surface truncate font-headline">
              {profile?.name || 'Người dùng'}
            </p>
            <p className="text-xs text-on-surface-variant truncate">
              {profile?.email || ''}
            </p>
          </div>
        </div>
      </div>

      {/* Menu items */}
      <div className="py-2 px-2">
        {menuItems.map((item, i) => (
          <button
            key={i}
            onClick={item.onClick}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]" data-icon={item.icon}>
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </div>

      {/* Logout */}
      <div className="border-t border-outline-variant/15 py-2 px-2 mb-1 md:mb-0">
        <button
          onClick={() => api.logout()}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-error hover:bg-error-container/20 transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]" data-icon="logout">
            logout
          </span>
          Đăng xuất
        </button>
      </div>
    </>
  )

  return (
    <div className="relative" ref={menuRef}>
      {/* Avatar trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative flex items-center justify-center rounded-full transition-all duration-300 hover:ring-2 hover:ring-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/40 ${isOpen ? 'ring-2 ring-primary/50 shadow-[0_0_15px_rgba(79,70,229,0.3)]' : ''}`}
        title="Tài khoản"
      >
        <img
          alt="User profile"
          className="h-7 w-7 md:h-9 md:w-9 rounded-full object-cover border-2 border-surface-container-highest"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuDHWf0xej2PzdHUfMqCY0A4vMVnXNx8DQz5QpbmpT6JeFy8MFpaFwArAmPhQsldHGjFB7tHH8LWHpBnxHXaf_UZ7_IC35tyR9ObIKkMEKBXytMWATGRV6XrkKJvWHap2tsX4Dh7PKbxNIj6W6XCaa7wQeBUKg_nOF7sYQysrc06vFHWyZFEN-hRGyJtMLGQ5U2FG_zs01hAWHTcXxneJZWXdGPwHb60eOtW6P8DNGivG814GXZRaxSV5LjGQ4d9Z_bH1sXtmnLGGjQ"
        />
      </button>

      {isOpen && (
        <>
          {/* Desktop dropdown */}
          <div className="hidden md:block absolute top-[calc(100%+8px)] right-0 z-[200] bg-surface/90 backdrop-blur-2xl rounded-2xl shadow-2xl border border-outline-variant/20 min-w-[260px] overflow-hidden animate-slideUpSpring">
            {renderMenuContent()}
          </div>

          {/* Mobile bottom sheet (Portal) */}
          {createPortal(
            <div className="md:hidden" id="mobile-account-menu">
              <div
                className="fixed inset-0 bg-black/30 z-[199]"
                onClick={() => setIsOpen(false)}
              />
              <div className="fixed bottom-0 left-0 right-0 z-[200] bg-surface rounded-t-2xl shadow-2xl border border-outline-variant/10 overflow-hidden animate-slideUp">
                {renderMenuContent()}
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  )
}
