import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { api } from '../../api/client'

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    api.getProfile()
      .then((profile: any) => {
        if (profile && profile.role === 'admin') setIsAdmin(true)
      })
      .catch((e) => console.log('not logged in or failed to fetch profile', e))
  }, [])

  const navLinkClass = ({ isActive }: { isActive: boolean }, extra = '') =>
    `flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 font-bold group/nav ${extra} ${isActive
      ? 'text-primary border-l-[3px] border-primary bg-primary/10 shadow-sm shadow-primary/5'
      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface hover:translate-x-1'
    }`

  const navItems = [
    { to: '/', end: true, icon: 'image', label: 'Ảnh' },
    { to: '/videos', icon: 'play_circle', label: 'Video' },
    { to: '/explore', icon: 'explore', label: 'Khám phá' },
    { to: '/favorites', icon: 'favorite', label: 'Yêu thích' },
    { to: '/albums', icon: 'library_books', label: 'Album' },
    { to: '/map', icon: 'map', label: 'Bản đồ' },
    { to: '/trash', icon: 'delete', label: 'Thùng rác' },
  ]

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden transition-opacity"
          onClick={onClose}
        />
      )}
      <aside className={`h-screen w-64 fixed left-0 top-0 bg-surface/70 backdrop-blur-2xl border-r border-outline-variant/20 flex flex-col py-8 px-6 z-50 transform transition-transform duration-300 ease-[0.34,1.56,0.64,1] ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
      <div className="mb-10 px-2 flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="w-12 h-12 object-contain" />
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold font-headline tracking-tight leading-none flex items-center">
            <span className="text-on-surface-variant">My</span>
            <span className="bg-gradient-to-r from-primary to-tertiary bg-clip-text text-transparent">CloudX</span>
          </h1>
          <p className="text-[10px] text-on-surface-variant font-medium tracking-wide mt-1 uppercase">Kho ảnh cá nhân</p>
        </div>
      </div>
      <nav className="flex-1 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onClose}
            className={(props) => navLinkClass(props)}
          >
            <span className="material-symbols-outlined transition-transform duration-300 group-hover/nav:scale-110" data-icon={item.icon}>{item.icon}</span>
            <span className="font-headline text-sm font-medium">{item.label}</span>
          </NavLink>
        ))}

        {isAdmin && (
          <NavLink
            to="/dashboard"
            onClick={onClose}
            className={(props) => navLinkClass(props, 'mt-auto mb-2')}
          >
            <span className="material-symbols-outlined" data-icon="monitoring">monitoring</span>
            <span className="font-headline text-sm font-medium">Bảng điều khiển</span>
          </NavLink>
        )}
      </nav>
      <div className="px-4 py-6 border-t border-outline-variant/10">
        <p className="text-[10px] text-on-surface-variant/50 font-medium text-center tracking-wider">MyCloudX v1.0</p>
      </div>
      </aside>
    </>
  )
}
