import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/client'

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (query.length < 2) { 
      setResults([]); 
      setShowDropdown(false);
      return;
    }
    const debounce = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await api.searchMedia(query)
        setResults(data.items || [])
        setShowDropdown(true)
      } catch { setResults([]) }
      setLoading(false)
    }, 300)
    return () => clearTimeout(debounce)
  }, [query])

  return (
    <div className="relative w-full max-w-md group">
      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors" data-icon="search">search</span>
      <input 
        name="search"
        autoComplete="off"
        className="w-full bg-surface-container/50 border border-outline-variant/30 rounded-full pl-12 pr-4 py-2.5 text-sm transition-all outline-none placeholder:text-on-surface-variant/60 font-body focus:bg-surface-container-lowest focus:border-primary/50 focus:shadow-[0_0_20px_rgba(79,70,229,0.15)] focus:ring-1 focus:ring-primary/30" 
        placeholder="Tìm kiếm kỷ niệm..." 
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (query.length >= 2) setShowDropdown(true) }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
      />
      
      {showDropdown && (
        <>
          {/* Mobile Fullscreen Backdrop */}
          <div className="fixed inset-0 z-[60] bg-surface/95 backdrop-blur-xl md:hidden animate-fadeIn" onClick={() => setShowDropdown(false)} />
          
          <div className="fixed inset-x-0 top-[calc(3rem+env(safe-area-inset-top))] bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[70] md:absolute md:inset-auto md:top-full md:left-0 md:right-0 md:mt-2 bg-surface/90 md:backdrop-blur-2xl md:rounded-2xl md:shadow-2xl md:border border-outline-variant/20 overflow-hidden md:z-50 animate-slideUp">
            {loading && <div className="p-4 text-center"><div className="spinner mx-auto" /></div>}
            
            {!loading && results.length > 0 && (
              <div className="h-full md:max-h-80 overflow-y-auto p-2 md:p-2 space-y-1 pb-[env(safe-area-inset-bottom)] md:pb-2">
                {results.slice(0, 8).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 md:p-2 rounded-xl hover:bg-surface-container cursor-pointer transition-colors active:scale-95 md:active:scale-100"
                    onClick={() => {
                      setShowDropdown(false)
                      navigate('/')
                    }}
                  >
                    {item.thumbnails?.micro ? (
                      <img src={item.thumbnails.micro} alt="" className="w-12 h-12 md:w-10 md:h-10 rounded-lg object-cover shadow-sm" />
                    ) : (
                      <div className="w-12 h-12 md:w-10 md:h-10 rounded-lg bg-surface-container-high shadow-sm" />
                    )}
                    <div>
                      <div className="text-sm md:text-sm font-semibold text-on-surface">{item.original_name}</div>
                      <div className="text-xs text-on-surface-variant font-medium mt-0.5">
                        {item.width && `${item.width}×${item.height}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && query.length >= 2 && results.length === 0 && (
              <div className="p-8 md:p-4 text-center text-sm md:text-sm text-on-surface-variant font-medium">
                Không tìm thấy kết quả cho "{query}"
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
