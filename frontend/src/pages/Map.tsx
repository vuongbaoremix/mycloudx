import { useState, useEffect, useRef } from 'react'
import { MapPin, Navigation, X } from 'lucide-react'
import api from '../api/client'
import Lightbox from '../components/gallery/Lightbox'
import { SkeletonMap } from '../components/ui/Skeleton'

// Leaflet CSS must be imported
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'

// Fix default marker icon (Leaflet + bundlers issue)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// @ts-expect-error - Leaflet internal
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

interface MediaItem {
  id: string
  original_name: string
  mime_type: string
  size?: number
  width?: number
  height?: number
  thumbnails: {
    micro?: string
    small?: string
    medium?: string
    web?: string
  }
  blur_hash?: string
  aspect_ratio: number
  is_favorite: boolean
  storage_path: string
  created_at: string
  status?: string
  _previewUrl?: string
  metadata?: {
    location?: {
      lat: number
      lng: number
    }
    taken_at?: string
    camera_make?: string
    camera_model?: string
  }
}

// Custom marker icon using image thumbnail
const createCustomIcon = (item: MediaItem) => {
  const thumb = item.thumbnails.micro || item.thumbnails.small || item.thumbnails.medium || item.thumbnails.web || (item.storage_path ? `/api/media/serve/${encodeURIComponent(item.storage_path)}` : '');
  return L.divIcon({
    className: 'map-marker-custom',
    html: `<div class="map-marker-thumb ${item.is_favorite ? 'favorite' : ''}" style="background-image: url('${thumb}')"></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 54],
    popupAnchor: [0, -48],
  });
}

// Component to fit bounds on data load
function FitBounds({ items }: { items: MediaItem[] }) {
  const map = useMap()

  useEffect(() => {
    if (items.length === 0) return
    const points = items
      .filter((m) => m.metadata?.location?.lat != null && m.metadata?.location?.lng != null)
      .map((m) => [m.metadata!.location!.lat, m.metadata!.location!.lng] as [number, number])
    if (points.length > 0) {
      const bounds = L.latLngBounds(points)
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
    }
  }, [items, map])

  return null
}

export default function MapPage() {
  const [media, setMedia] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [isDark, setIsDark] = useState(true)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    // Check initial theme
    const checkTheme = () => document.documentElement.className.includes('dark')
    setIsDark(checkTheme())

    // Observe theme changes
    const observer = new MutationObserver(() => setIsDark(checkTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    loadGeoMedia()
  }, [])

  const loadGeoMedia = async () => {
    try {
      const data = await api.getGeoMedia()
      setMedia(data || [])
    } catch (err) {
      console.error('Failed to load geo media:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkerClick = (item: MediaItem) => {
    console.log("Clicked Map Marker:", item);
    setSelectedMedia(item)
  }

  const flyToLocation = (lat: number, lng: number) => {
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lng], 15, { duration: 1.5 })
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (loading) {
    return <SkeletonMap />
  }

  if (media.length === 0) {
    return (
      <div className="empty-state">
        <MapPin size={64} className="empty-state-icon" />
        <h3>Chưa có ảnh nào có vị trí</h3>
        <p>Tải lên ảnh có dữ liệu GPS để xem chúng trên bản đồ</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-full relative" style={{ height: 'calc(100vh - 100px)' }}>
      {/* Stats bar */}
      <div className="flex items-center justify-between gap-2 mb-4 px-2">
        <div className="flex items-center gap-2">
          <MapPin size={20} color="var(--accent)" />
          <span className="text-base">
            <strong>{media.length}</strong> ảnh có thông tin định vị
          </span>
        </div>
      </div>

      {/* Map Content Area */}
      <div className="flex-1 w-full relative rounded-2xl overflow-hidden shadow-xl border border-white/10 dark:border-border flex">
        {/* Map Container */}
        <div className="flex-1 relative h-full">
        <MapContainer
          center={[16.0, 106.0]}
          zoom={6}
          style={{ height: '100%', width: '100%', zIndex: 10 }}
          ref={mapRef}
          zoomControl={false}
        >
          {/* Theme dependent tile layer */}
          <TileLayer
            key={isDark ? 'dark' : 'light'}
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url={isDark 
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            }
          />

          <FitBounds items={media} />

          <MarkerClusterGroup 
            chunkedLoading 
            maxClusterRadius={60}
            iconCreateFunction={(cluster: any) => {
              const count = cluster.getChildCount();
              return L.divIcon({
                html: `<div class="cluster-icon">${count}</div>`,
                className: 'custom-cluster-marker',
                iconSize: [44, 44],
                iconAnchor: [22, 22]
              });
            }}
          >
            {media.map((item) => {
              if (item.metadata?.location?.lat == null || item.metadata?.location?.lng == null) return null
              const { lat, lng } = item.metadata.location
              return (
                <Marker
                  key={item.id}
                  position={[lat, lng]}
                  icon={createCustomIcon(item)}
                  eventHandlers={{
                    click: () => handleMarkerClick(item),
                  }}
                >
                  <Popup className="rounded-xl overflow-hidden shadow-lg border-none" closeButton={false}>
                    <div className="flex flex-col w-48 bg-surface rounded-xl overflow-hidden">
                      <div className="h-32 w-full bg-surface-container-high relative">
                        {item.thumbnails.small || item.thumbnails.micro || item.thumbnails.medium || item.thumbnails.web || item.storage_path ? (
                          <img
                            src={item.thumbnails.small || item.thumbnails.micro || item.thumbnails.medium || item.thumbnails.web || `/api/media/serve/${encodeURIComponent(item.storage_path)}`}
                            alt={item.original_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                            <span className="material-symbols-outlined text-[32px]">image</span>
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="font-bold text-sm text-on-surface truncate" title={item.original_name}>{item.original_name}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">{formatDate(item.created_at)}</p>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MarkerClusterGroup>
        </MapContainer>
        </div>

        {/* Side panel for selected item (Bottom sheet on mobile) */}
        {selectedMedia && (
          <div className="absolute inset-x-0 bottom-0 md:relative w-full md:w-80 h-[55vh] md:h-full bg-surface-container-lowest border-t md:border-t-0 md:border-l border-white/10 dark:border-border flex flex-col z-[400] md:z-20 overflow-y-auto animate-slideUpSpring md:animate-slideLeft rounded-t-3xl md:rounded-none pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 shadow-[0_-10px_40px_rgba(0,0,0,0.3)] md:shadow-none">
            <div className="flex items-center justify-between p-4 border-b border-border/40 sticky top-0 bg-surface-container-lowest z-10 rounded-t-3xl md:rounded-none">
              <span className="font-extrabold text-base text-on-surface">Chi tiết điểm chụp</span>
              <button className="p-1.5 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors" onClick={() => setSelectedMedia(null)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 flex flex-col gap-6">
              <div className="w-full aspect-square rounded-xl overflow-hidden bg-surface-container relative shadow-sm group">
                {selectedMedia.thumbnails.medium || selectedMedia.thumbnails.small || selectedMedia.thumbnails.web || selectedMedia.storage_path ? (
                  <img
                    src={selectedMedia.thumbnails.medium || selectedMedia.thumbnails.small || selectedMedia.thumbnails.web || `/api/media/serve/${encodeURIComponent(selectedMedia.storage_path)}`}
                    alt={selectedMedia.original_name}
                    className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-500"
                    onClick={() => setLightboxIndex(media.findIndex(m => m.id === selectedMedia.id))}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                    <span className="material-symbols-outlined text-[48px]">image</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none"></div>
                
                <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md text-white text-[10px] uppercase font-bold tracking-widest pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                  Xem Full
                </div>
              </div>

              <div>
                <h4 className="font-bold text-lg text-on-surface mb-4 break-words leading-tight">{selectedMedia.original_name}</h4>
                
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center py-2 border-b border-border/40">
                    <span className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider">Ngày chụp</span>
                    <span className="text-sm font-medium text-on-surface">{formatDate(selectedMedia.created_at)}</span>
                  </div>
                  
                  {selectedMedia.metadata?.camera_model && (
                    <div className="flex justify-between items-center py-2 border-b border-border/40">
                      <span className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider">Thiết bị</span>
                      <span className="text-sm font-medium text-on-surface text-right max-w-[150px] truncate" title={selectedMedia.metadata.camera_model}>
                        {selectedMedia.metadata.camera_model}
                      </span>
                    </div>
                  )}
                  
                  {selectedMedia.metadata?.location && (
                    <div className="flex justify-between items-center py-2 border-b border-border/40">
                      <span className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider">Tọa độ</span>
                      <span className="text-sm font-medium text-primary font-mono text-right">
                        {selectedMedia.metadata.location.lat.toFixed(5)}<br/>
                        {selectedMedia.metadata.location.lng.toFixed(5)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {selectedMedia.metadata?.location && (
                <button
                  className="mt-2 w-full py-3 bg-primary hover:bg-primary-container hover:text-on-primary-container text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
                  onClick={() =>
                    flyToLocation(
                      selectedMedia.metadata!.location!.lat,
                      selectedMedia.metadata!.location!.lng
                    )
                  }
                >
                  <Navigation size={18} />
                  Bay tới điểm này
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox for viewing photos directly from map */}
      {lightboxIndex !== null && (
        <Lightbox
          media={media}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onFavorite={async (id) => {
             const updated = await api.toggleFavorite(id);
             setMedia(prev => prev.map(m => m.id === id ? { ...m, is_favorite: updated.is_favorite } : m));
             if (selectedMedia && selectedMedia.id === id) {
               setSelectedMedia({ ...selectedMedia, is_favorite: updated.is_favorite });
             }
          }}
          onDelete={async (id) => {
            await api.deleteMedia(id);
            setMedia(prev => prev.filter(m => m.id !== id));
            if (selectedMedia && selectedMedia.id === id) {
               setSelectedMedia(null);
            }
            setLightboxIndex(null);
          }}
        />
      )}
    </div>
  )
}
