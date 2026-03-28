import { useState, useEffect } from 'react'
import { LayoutGrid, Calendar, ChevronRight, ImageIcon } from 'lucide-react'
import api from '../api/client'
import { SkeletonMosaic } from '../components/ui/Skeleton'

interface TimelineGroup {
  year: number
  month: number
  count: number
  thumbnails: string[]
}

interface TimelineResponse {
  groups: TimelineGroup[]
  total: number
}

const MONTH_NAMES = [
  '', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
]

export default function Mosaic() {
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [expandedMedia, setExpandedMedia] = useState<any[]>([])
  const [expandLoading, setExpandLoading] = useState(false)

  useEffect(() => {
    loadTimeline()
  }, [])

  const loadTimeline = async () => {
    try {
      const data = await api.getTimeline()
      setTimeline(data)
    } catch (err) {
      console.error('Failed to load timeline:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleGroupClick = async (group: TimelineGroup) => {
    const key = `${group.year}-${group.month}`
    if (expandedGroup === key) {
      setExpandedGroup(null)
      setExpandedMedia([])
      return
    }

    setExpandedGroup(key)
    setExpandLoading(true)
    try {
      // Load all media for this month
      const data = await api.listMedia({
        page: 1,
        limit: 100,
        sort: 'date',
        year: group.year,
        month: group.month,
      })
      const items = data.items || []
      setExpandedMedia(items)
    } catch (err) {
      console.error('Failed to load month media:', err)
    } finally {
      setExpandLoading(false)
    }
  }

  // Group by year for rendering
  const groupsByYear = (timeline?.groups || []).reduce(
    (acc, group) => {
      if (!acc[group.year]) acc[group.year] = []
      acc[group.year].push(group)
      return acc
    },
    {} as Record<number, TimelineGroup[]>
  )

  const years = Object.keys(groupsByYear)
    .map(Number)
    .sort((a, b) => b - a)

  if (loading) {
    return <SkeletonMosaic />
  }

  if (!timeline || timeline.groups.length === 0) {
    return (
      <div className="empty-state">
        <LayoutGrid size={64} className="empty-state-icon" />
        <h3>Chưa có ảnh nào</h3>
        <p>Tải lên ảnh để xem dòng thời gian</p>
      </div>
    )
  }

  return (
    <div className="mosaic-page">
      {/* Header */}
      <div className="mosaic-header">
        <div className="flex items-center gap-2">
          <LayoutGrid size={20} color="var(--accent)" />
          <h1 className="text-2xl font-extrabold font-headline text-on-surface tracking-tight">Dòng thời gian</h1>
        </div>
        <div className="mosaic-total">
          <ImageIcon size={14} />
          <span>{timeline.total} ảnh</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="mosaic-timeline">
        {years.map((year) => (
          <div key={year} className="mosaic-year-section">
            <div className="mosaic-year-header">
              <Calendar size={18} />
              <span>{year}</span>
              <span className="mosaic-year-count">
                {groupsByYear[year].reduce((s, g) => s + g.count, 0)} ảnh
              </span>
            </div>

            <div className="mosaic-month-grid">
              {groupsByYear[year].map((group) => {
                const key = `${group.year}-${group.month}`
                const isExpanded = expandedGroup === key

                return (
                  <div key={key} className="mosaic-month-wrapper">
                    <div
                      className={`mosaic-month-card ${isExpanded ? 'expanded' : ''}`}
                      onClick={() => handleGroupClick(group)}
                    >
                      {/* Thumbnail mosaic preview */}
                      <div className="mosaic-thumb-grid">
                        {group.thumbnails.length > 0 ? (
                          group.thumbnails.slice(0, 4).map((thumb, i) => (
                            <img
                              key={i}
                              src={`/api/media/serve/${encodeURIComponent(thumb)}`}
                              alt=""
                              className="mosaic-thumb-img"
                              loading="lazy"
                            />
                          ))
                        ) : (
                          <div className="mosaic-thumb-placeholder">
                            <ImageIcon size={24} />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="mosaic-month-info">
                        <span className="mosaic-month-name">
                          {MONTH_NAMES[group.month]}
                        </span>
                        <span className="mosaic-month-count">
                          {group.count} ảnh
                        </span>
                        <ChevronRight
                          size={16}
                          className={`mosaic-month-chevron ${isExpanded ? 'rotated' : ''}`}
                        />
                      </div>
                    </div>

                    {/* Expanded gallery for this month */}
                    {isExpanded && (
                      <div className="mosaic-expanded-gallery">
                        {expandLoading ? (
                          <div className="flex items-center" style={{ justifyContent: 'center', padding: 24 }}>
                            <div className="spinner" />
                          </div>
                        ) : expandedMedia.length > 0 ? (
                          <div className="mosaic-expanded-grid">
                            {expandedMedia.map((item: any) => (
                              <div key={item.id} className="mosaic-expanded-item">
                                <img
                                  src={`/api/media/serve/${encodeURIComponent(
                                    item.thumbnails?.small || item.thumbnails?.medium || ''
                                  )}`}
                                  alt={item.original_name}
                                  loading="lazy"
                                />
                                <div className="mosaic-expanded-overlay">
                                  <span>{item.original_name}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-muted text-sm" style={{ padding: 16, textAlign: 'center' }}>
                            Không tìm thấy ảnh trong tháng này
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
