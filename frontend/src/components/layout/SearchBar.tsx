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
        className="w-full bg-surface-container/50 border border-outline-variant/30 rounded-full pl-12 pr-4 py-2.5 text-sm transition-all outline-none placeholder:text-on-surface-variant/60 font-body focus:bg-surface-container-lowest focus:border-primary/50 focus:shadow-[0_0_20px_rgba(79,70,229,0.15)] focus:ring-1 focus:ring-primary/30" 
        placeholder="Tìm kiếm kỷ niệm..." 
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (query.length >= 2) setShowDropdown(true) }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
      />
      
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-surface/90 backdrop-blur-2xl rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden z-50 animate-slideUp">
          {loading && <div className="p-4 text-center"><div className="spinner mx-auto" /></div>}
          
          {!loading && results.length > 0 && (
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {results.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-container cursor-pointer transition-colors"
                  onClick={() => navigate('/')}
                >
                  {item.thumbnails?.micro ? (
                    <img src={item.thumbnails.micro} alt="" className="w-10 h-10 rounded-md object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-md bg-surface-container-high" />
                  )}
                  <div>
                    <div className="text-sm font-medium text-on-surface">{item.original_name}</div>
                    <div className="text-xs text-on-surface-variant">
                      {item.width && `${item.width}×${item.height}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="p-4 text-center text-sm text-on-surface-variant">
              Không tìm thấy kết quả cho "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  )
}
