import { NavLink } from 'react-router-dom'

export default function BottomNav() {
  const navItems = [
    { to: '/', end: true, icon: 'image', label: 'Ảnh' },
    { to: '/explore', icon: 'explore', label: 'Khám phá' },
    { to: '/map', icon: 'map', label: 'Bản đồ' },
    { to: '/albums', icon: 'library_books', label: 'Album' },
  ]

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-200 active:scale-95 ${
      isActive
        ? 'text-primary'
        : 'text-on-surface-variant hover:text-on-surface'
    }`

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-surface/85 backdrop-blur-2xl border-t border-outline-variant/15 flex items-center justify-around z-40 md:hidden">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={(props) => navLinkClass(props)}
        >
          {({ isActive }) => (
            <>
              <div className={`relative flex items-center justify-center w-14 h-8 rounded-full transition-colors duration-200 ${isActive ? 'bg-primary/10' : ''}`}>
                <span 
                  className={`material-symbols-outlined text-[22px] transition-transform duration-200 ${isActive ? 'filled scale-110' : ''}`}
                >
                  {item.icon}
                </span>
              </div>
              <span className={`text-[10px] font-medium tracking-wide ${isActive ? 'font-bold' : ''}`}>
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
