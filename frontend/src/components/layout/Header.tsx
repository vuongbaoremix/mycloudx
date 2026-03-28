import { Menu } from 'lucide-react'
import SearchBar from './SearchBar'
import AccountMenu from './AccountMenu'

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="fixed top-0 right-0 w-full md:w-[calc(100%-16rem)] h-12 md:h-16 z-40 bg-surface/70 backdrop-blur-2xl border-b border-outline-variant/20 flex justify-between items-center px-2 md:px-8 transition-all duration-300">
      <div className="flex items-center w-[75%] md:w-1/2 gap-1 md:gap-3">
        <button 
          className="md:hidden p-2 -ml-2 rounded-full text-on-surface-variant hover:bg-surface-container transition-colors flex-shrink-0"
          onClick={onMenuClick}
        >
          <Menu size={24} />
        </button>
        <div className="flex-1 min-w-0">
          <SearchBar />
        </div>
      </div>
      <div className="flex items-center">
        <AccountMenu />
      </div>
    </header>
  )
}
