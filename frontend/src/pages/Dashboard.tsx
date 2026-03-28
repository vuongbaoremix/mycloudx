import { useState, useEffect } from 'react'
import {
  Activity, Users, HardDrive, Image, FolderOpen,
  AlertCircle, RefreshCw, Server
} from 'lucide-react'
import { api } from '../api/client'
import { SkeletonDashboard } from '../components/ui/Skeleton'

export default function Dashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [prevStats, setPrevStats] = useState<{bytes: number, time: number} | null>(null)
  const [processSpeed, setProcessSpeed] = useState(0)

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [])

  const refresh = async () => {
    try {
      const res = await api.getSystemDashboard();
      
      setData((prev: any) => {
        if (prev && prev.server_metrics?.bytes_processed !== undefined) {
          const now = Date.now()
          const diffBytes = res.server_metrics.bytes_processed - prev.server_metrics.bytes_processed
          const diffTime = (now - (prevStats?.time || now - 5000)) / 1000
          if (diffTime > 0) {
            setProcessSpeed(diffBytes / diffTime)
          }
          setPrevStats({ bytes: res.server_metrics.bytes_processed, time: now })
        } else {
          setPrevStats({ bytes: res.server_metrics?.bytes_processed || 0, time: Date.now() })
        }
        return res
      })
      
      setError('')
    } catch (err: any) {
      if (err.message?.includes('403') || err.message?.includes('Forbidden')) {
        setError('Bạn không có quyền truy cập trang này.')
      } else {
        setError('Lỗi kết nối tới máy chủ.')
      }
    } finally {
      setLoading(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (!bytes || isNaN(bytes)) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
    if (bytes < 1099511627776) return `${(bytes / 1073741824).toFixed(1)} GB`
    return `${(bytes / 1099511627776).toFixed(1)} TB`
  }
  
  const parsePrometheus = (text: string) => {
    const m: Record<string, number> = {}
    if (!text) return m
    for (const line of text.split('\n')) {
      if (line.startsWith('#') || !line.trim()) continue
      const parts = line.trim().split(/\s+/)
      if (parts.length >= 2) {
        m[parts[0]] = parseFloat(parts[1])
      }
    }
    return m
  }

  if (loading && !data) return <SkeletonDashboard />

  if (error) {
    return (
      <div className="gallery-container flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-bold mb-2 text-on-surface">Truy cập bị từ chối</h2>
          <p className="text-on-surface-variant">{error}</p>
        </div>
      </div>
    )
  }

  const backend = data?.backend_stats || {}
  const system = data?.server_metrics || {}
  const csHealth = data?.cloudstore_health || {}
  const csStats = data?.cloudstore_stats || {}
  const metrics = parsePrometheus(data?.cloudstore_metrics || '')

  const totalFiles = csHealth.total_files || 0
  const syncStatus = csStats.by_status || { synced: 0, cached: 0, syncing: 0, sync_failed: 0 }
  const totalSync = totalFiles || 1

  return (
    <div className="gallery-container pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-4 border-b border-[var(--border)]">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="text-primary" />
            System Dashboard
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">Thống kê trực tiếp từ Backend & CloudStore</p>
        </div>
        <div className="flex items-center gap-4 text-sm text-on-surface-variant">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Đã kết nối
          </span>
          <button onClick={refresh} className="btn btn-ghost" title="Làm mới">
            <RefreshCw size={16} /> Làm mới
          </button>
        </div>
      </div>

      {/* Thống kê Backend */}
      <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4">Cơ sở dữ liệu nội bộ</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { icon: Users, label: 'Người dùng', value: backend.total_users || 0, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
          { icon: Image, label: 'Tệp phương tiện', value: (backend.total_media || 0).toLocaleString(), color: 'text-green-400', bg: 'bg-green-500/10' },
          { icon: HardDrive, label: 'Dung lượng', value: formatBytes(backend.total_storage_bytes), color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { icon: FolderOpen, label: 'Album', value: backend.total_albums || 0, color: 'text-red-400', bg: 'bg-red-500/10' },
        ].map((stat, i) => (
          <div key={i} className="card flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color}`}>
              <stat.icon size={24} />
            </div>
            <div>
              <div className="text-sm text-on-surface-variant">{stat.label}</div>
              <div className="text-2xl font-bold">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Hardware Node Stats */}
      {system.cpu_usage_percent !== undefined && (
        <>
          <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4 mt-8 flex items-center gap-2">
            <Server size={16} /> Phần cứng máy chủ
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="card">
              <div className="text-sm text-on-surface-variant uppercase tracking-wider mb-2 font-semibold">CPU</div>
              <div className="text-3xl font-bold text-sky-400 mb-1">{system.cpu_usage_percent.toFixed(1)}%</div>
              <div className="w-full h-1.5 bg-surface-container rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-sky-500" style={{ width: `${Math.min(100, system.cpu_usage_percent)}%` }}></div>
              </div>
            </div>
            <div className="card">
              <div className="text-sm text-on-surface-variant uppercase tracking-wider mb-2 font-semibold">Bộ nhớ RAM</div>
              <div className="text-3xl font-bold text-fuchsia-400 mb-1">{((system.mem_used / (system.mem_total || 1)) * 100).toFixed(1)}%</div>
              <div className="text-sm text-on-surface-variant">{formatBytes(system.mem_used)} / {formatBytes(system.mem_total)}</div>
              <div className="w-full h-1.5 bg-surface-container rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-fuchsia-500" style={{ width: `${Math.min(100, (system.mem_used / (system.mem_total || 1)) * 100)}%` }}></div>
              </div>
            </div>
            <div className="card">
              <div className="text-sm text-slate-400 uppercase tracking-wider mb-2 font-semibold">Network RX</div>
              <div className="text-3xl font-bold text-emerald-400 mb-1">{formatBytes(system.network_rx_bytes / 2)}/s</div>
              <div className="text-sm text-emerald-500/60">Lưu lượng vào</div>
            </div>
            <div className="card">
              <div className="text-sm text-slate-400 uppercase tracking-wider mb-2 font-semibold">Network TX</div>
              <div className="text-3xl font-bold text-amber-400 mb-1">{formatBytes(system.network_tx_bytes / 2)}/s</div>
              <div className="text-sm text-amber-500/60">Lưu lượng ra</div>
            </div>
          </div>
          
          <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4 mt-8 flex items-center gap-2">
            <Activity size={16} /> Hàng đợi xử lý
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="card border-blue-500/20 bg-blue-500/5">
              <div className="text-sm text-blue-400/80 uppercase tracking-wider mb-2 font-semibold">Đang chờ</div>
              <div className="text-3xl font-bold text-blue-400 mb-1">{system.jobs_pending || 0}</div>
              <div className="text-sm text-blue-500/60">Chờ xử lý</div>
            </div>
            <div className="card border-amber-500/20 bg-amber-500/5">
              <div className="text-sm text-amber-400/80 uppercase tracking-wider mb-2 font-semibold">Đang xử lý</div>
              <div className="text-3xl font-bold text-amber-400 mb-1">{system.jobs_processing || 0}</div>
              <div className="text-sm text-amber-500/60">Tạo thumbnail & tải lên</div>
            </div>
            <div className="card border-green-500/20 bg-green-500/5">
              <div className="text-sm text-green-400/80 uppercase tracking-wider mb-2 font-semibold">Hoàn thành</div>
              <div className="text-3xl font-bold text-green-400 mb-1">{system.jobs_completed || 0}</div>
              <div className="text-sm text-green-500/60">Xử lý thành công</div>
            </div>
            <div className="card border-indigo-500/20 bg-indigo-500/5">
              <div className="text-sm text-indigo-400/80 uppercase tracking-wider mb-2 font-semibold">Tốc độ xử lý</div>
              <div className="text-3xl font-bold text-indigo-400 mb-1">{formatBytes(processSpeed)}/s</div>
              <div className="text-sm text-indigo-500/60">Thông lượng</div>
            </div>
          </div>
        </>
      )}

      {/* CloudStore Storage & Traffic */}
      <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4 mt-8 flex items-center gap-2">
        <Server size={16} /> CloudStore Worker
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <div className="text-sm text-on-surface-variant uppercase tracking-wider mb-2 font-semibold">Tệp trên Cloud</div>
          <div className="text-3xl font-bold text-indigo-400 mb-1">{totalFiles.toLocaleString()}</div>
          <div className="text-sm text-on-surface-variant">{formatBytes(csHealth.total_size_bytes)} đã dùng</div>
        </div>
        <div className="card border-green-500/20 bg-green-500/5">
          <div className="text-sm text-green-400/80 uppercase tracking-wider mb-2 font-semibold">Tải lên</div>
          <div className="text-3xl font-bold text-green-400 mb-1">{metrics.cloudstore_uploads_total || 0}</div>
          <div className="text-sm text-green-500/60">{formatBytes(metrics.cloudstore_bytes_uploaded_total)} đã tải</div>
        </div>
        <div className="card border-blue-500/20 bg-blue-500/5">
          <div className="text-sm text-blue-400/80 uppercase tracking-wider mb-2 font-semibold">Tải xuống</div>
          <div className="text-3xl font-bold text-blue-400 mb-1">
            {(metrics.cloudstore_downloads_cache_total || 0) + (metrics.cloudstore_downloads_cloud_total || 0)}
          </div>
          <div className="text-sm text-blue-500/60">{formatBytes(metrics.cloudstore_bytes_downloaded_total)} đã tải</div>
        </div>
      </div>

      {/* Sync Status Progress */}
      <div className="card mb-8">
        <h4 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-4">Trạng thái đồng bộ Cloud</h4>
        <div className="flex h-3 rounded-full overflow-hidden bg-surface-container mb-4">
          <div style={{ width: `${(syncStatus.synced / totalSync) * 100}%` }} className="bg-green-500 transition-all duration-500" title="Đã đồng bộ"></div>
          <div style={{ width: `${(syncStatus.cached / totalSync) * 100}%` }} className="bg-yellow-400 transition-all duration-500" title="Đã cache"></div>
          <div style={{ width: `${(syncStatus.syncing / totalSync) * 100}%` }} className="bg-blue-500 transition-all duration-500" title="Đang đồng bộ"></div>
          <div style={{ width: `${(syncStatus.sync_failed / totalSync) * 100}%` }} className="bg-red-500 transition-all duration-500" title="Thất bại"></div>
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-green-500"></span> Đã đồng bộ: <span className="font-bold">{syncStatus.synced || 0}</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-yellow-400"></span> Đã cache: <span className="font-bold">{syncStatus.cached || 0}</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-blue-500"></span> Đang đồng bộ: <span className="font-bold">{syncStatus.syncing || 0}</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-red-500"></span> Thất bại: <span className="font-bold text-red-400">{syncStatus.sync_failed || 0}</span></div>
        </div>
      </div>
      
      {/* Sync Pipeline Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card border-emerald-500/20 bg-emerald-500/5">
          <div className="text-sm font-semibold text-emerald-400/80 uppercase tracking-wider mb-2">Đồng bộ thành công</div>
          <div className="text-2xl font-bold text-emerald-400">{metrics.cloudstore_sync_success_total || 0}</div>
        </div>
        <div className="card border-red-500/20 bg-red-500/5">
          <div className="text-sm font-semibold text-red-400/80 uppercase tracking-wider mb-2">Đồng bộ thất bại</div>
          <div className="text-2xl font-bold text-red-500">{metrics.cloudstore_sync_failure_total || 0}</div>
        </div>
      </div>
    </div>
  )
}
