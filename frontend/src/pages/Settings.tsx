import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, User, Palette, ChevronRight, HardDrive, Shield, Lock, Copy, KeyRound, ShieldCheck, ShieldAlert } from 'lucide-react'
import api from '../api/client'
import { SkeletonSettings } from '../components/ui/Skeleton'

type Tab = 'profile' | 'password' | 'preferences'

export default function Settings() {
  const [tab, setTab] = useState<Tab>('profile')
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmNewPw, setConfirmNewPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Encryption state
  const [encEnabled, setEncEnabled] = useState(false)
  const [encPassword, setEncPassword] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [showRecoveryModal, setShowRecoveryModal] = useState(false)
  const [showRecoverInput, setShowRecoverInput] = useState(false)
  const [recoverKey, setRecoverKey] = useState('')
  const [recoverPw, setRecoverPw] = useState('')
  const [encLoading, setEncLoading] = useState(false)
  const [copiedRecoveryKey, setCopiedRecoveryKey] = useState(false)

  useEffect(() => {
    Promise.all([
      api.getProfile(),
      api.getEncryptionStatus().catch(() => ({ enabled: false })),
    ]).then(([p, enc]) => {
      setProfile(p)
      setName(p.name)
      setEncEnabled(enc.enabled)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <SkeletonSettings />

  const saveProfile = async () => {
    try {
      const updated = await api.updateProfile({ name })
      setProfile(updated)
      setMessage('Đã lưu thành công')
      setTimeout(() => setMessage(''), 3000)
    } catch { setError('Có lỗi xảy ra') }
  }

  const changePassword = async () => {
    if (newPw !== confirmNewPw) {
      setError('Mật khẩu xác nhận không khớp')
      return
    }
    setPwLoading(true)
    setError('')
    try {
      await api.changePassword(currentPw, newPw)
      setCurrentPw('')
      setNewPw('')
      setConfirmNewPw('')
      setMessage('Đổi mật khẩu thành công')
      setTimeout(() => setMessage(''), 3000)
    } catch {
      setError('Mật khẩu hiện tại không đúng')
    } finally {
      setPwLoading(false)
    }
  }

  const handleEnableEncryption = async () => {
    if (!encPassword) return
    setEncLoading(true)
    setError('')
    try {
      const data = await api.enableEncryption(encPassword)
      setEncEnabled(true)
      setEncPassword('')
      setRecoveryKey(data.recovery_key)
      setShowRecoveryModal(true)
    } catch {
      setError('Không thể kích hoạt mã hóa. Kiểm tra lại mật khẩu.')
    } finally {
      setEncLoading(false)
    }
  }

  const handleDisableEncryption = async () => {
    if (!encPassword) return
    setEncLoading(true)
    setError('')
    try {
      await api.disableEncryption(encPassword)
      setEncEnabled(false)
      setEncPassword('')
      setMessage('Đã tắt mã hóa dữ liệu')
      setTimeout(() => setMessage(''), 3000)
    } catch {
      setError('Không thể tắt mã hóa. Kiểm tra lại mật khẩu.')
    } finally {
      setEncLoading(false)
    }
  }

  const handleRecoverEncryption = async () => {
    if (!recoverKey || !recoverPw) return
    setEncLoading(true)
    setError('')
    try {
      await api.recoverEncryption(recoverKey, recoverPw)
      setShowRecoverInput(false)
      setRecoverKey('')
      setRecoverPw('')
      setMessage('Khôi phục mã hóa thành công!')
      setTimeout(() => setMessage(''), 3000)
    } catch {
      setError('Khóa khôi phục hoặc mật khẩu không đúng.')
    } finally {
      setEncLoading(false)
    }
  }

  const copyRecoveryKey = () => {
    navigator.clipboard.writeText(recoveryKey)
    setCopiedRecoveryKey(true)
    setTimeout(() => setCopiedRecoveryKey(false), 2000)
  }

  const tabs = [
    { key: 'profile' as Tab, label: 'Thông tin cá nhân', icon: User, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { key: 'password' as Tab, label: 'Bảo mật & Mật khẩu', icon: Shield, color: 'text-green-500', bg: 'bg-green-500/10' },
    { key: 'preferences' as Tab, label: 'Giao diện & Hệ thống', icon: Palette, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-10 pb-24">
      <div className="mb-10 text-center md:text-left">
        <h1 className="text-3xl md:text-4xl font-extrabold font-headline text-on-surface tracking-tight mb-2 flex items-center justify-center md:justify-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/20">
            <SettingsIcon size={24} />
          </div>
          Cài đặt hệ thống
        </h1>
        <p className="text-on-surface-variant font-medium text-lg ml-0 md:ml-16">
          Quản lý tài khoản và tùy chỉnh trải nghiệm MyCloudX của bạn
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* iOS-style Sidebar Menu */}
        <div className="w-full md:w-1/3 flex-shrink-0">
          <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-3xl overflow-hidden shadow-sm">
            {tabs.map((t, index) => (
              <button
                key={t.key}
                className={`w-full flex items-center justify-between p-4 text-left transition-colors
                  ${index !== tabs.length - 1 ? 'border-b border-outline-variant/10' : ''}
                  ${tab === t.key ? 'bg-surface-container' : 'hover:bg-surface-container-low'}
                `}
                onClick={() => { setTab(t.key); setMessage(''); setError('') }}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-9 h-9 flex items-center justify-center rounded-xl ${t.bg} ${t.color}`}>
                    <t.icon size={18} strokeWidth={2.5} />
                  </div>
                  <span className={`font-semibold ${tab === t.key ? 'text-primary' : 'text-on-surface'}`}>
                    {t.label}
                  </span>
                </div>
                <ChevronRight size={18} className="text-on-surface-variant/50" />
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="w-full md:w-2/3 flex-grow">
          {(message || error) && (
            <div className={`p-4 rounded-2xl mb-6 flex items-center gap-3 backdrop-blur-md border ${message ? 'bg-success/10 text-success border-success/20' : 'bg-danger/10 text-danger border-danger/20'
              } animate-fadeIn`}>
              <span className="material-symbols-outlined">{message ? 'check_circle' : 'error'}</span>
              <span className="font-semibold">{message || error}</span>
            </div>
          )}

          <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-3xl p-6 md:p-8 shadow-sm animate-fadeIn">
            {tab === 'profile' && profile && (
              <div className="space-y-6">
                <div className="flex items-center gap-6 mb-8 pb-8 border-b border-outline-variant/10">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-on-primary text-3xl font-bold shadow-lg">
                    {profile.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-on-surface">{profile.name}</h2>
                    <p className="text-on-surface-variant font-medium">{profile.email}</p>
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">
                      <Shield size={12} /> {profile.role}
                    </div>
                  </div>
                </div>

                <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-4">Thông tin cơ bản</h3>

                <div className="space-y-5">
                  <div className="form-group">
                    <label className="form-label">Họ và tên</label>
                    <input className="form-input bg-surface-container-low" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email đăng nhập</label>
                    <input className="form-input bg-surface-container cursor-not-allowed opacity-70" value={profile.email} disabled />
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-outline-variant/10">
                  <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-4 flex items-center gap-2">
                    <HardDrive size={16} /> Dung lượng lưu trữ
                  </h3>
                  <div className="bg-surface-container-low rounded-2xl p-5 border border-outline-variant/10">
                    <div className="flex justify-between text-sm font-semibold mb-2">
                      <span className="text-primary">
                        {profile.storage_used >= 1024 * 1024 * 1024 
                          ? (profile.storage_used / 1024 / 1024 / 1024).toFixed(1) + ' GB' 
                          : (profile.storage_used / 1024 / 1024).toFixed(1) + ' MB'}
                      </span>
                      <span className="text-on-surface-variant">
                        {profile.storage_quota >= 1024 * 1024 * 1024 * 1024
                          ? (profile.storage_quota / 1024 / 1024 / 1024 / 1024).toFixed(1) + ' TB'
                          : (profile.storage_quota / 1024 / 1024 / 1024).toFixed(1) + ' GB'}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, (profile.storage_used / profile.storage_quota) * 100)}%` }}></div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <button className="btn btn-primary px-8 shadow-lg shadow-primary/25" onClick={saveProfile}>Lưu thay đổi</button>
                </div>
              </div>
            )}

            {tab === 'password' && (
              <div className="space-y-6">
                {/* Change Password Section */}
                <form onSubmit={(e) => { e.preventDefault(); changePassword(); }} className="mb-6">
                  <h2 className="text-xl font-bold text-on-surface mb-2">Thay đổi mật khẩu</h2>
                  <p className="text-on-surface-variant text-sm mb-4">Cập nhật mật khẩu để bảo vệ tài khoản của bạn.</p>

                  {/* Hidden username for browser context */}
                  <input type="text" name="email" autoComplete="username" defaultValue={profile.email} style={{ display: 'none' }} aria-hidden="true" />

                  <div className="space-y-5">
                    <div className="form-group">
                      <label className="form-label">Mật khẩu hiện tại</label>
                      <input type="password" name="current-password" autoComplete="new-password" className="form-input bg-surface-container-low" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="••••••••" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Mật khẩu mới</label>
                      <input type="password" name="new-password" autoComplete="new-password" className="form-input bg-surface-container-low" value={newPw} onChange={(e) => setNewPw(e.target.value)} minLength={6} placeholder="Ít nhất 6 ký tự" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Xác nhận mật khẩu mới</label>
                      <input type="password" name="confirm-new-password" autoComplete="new-password" className="form-input bg-surface-container-low" value={confirmNewPw} onChange={(e) => setConfirmNewPw(e.target.value)} minLength={6} placeholder="Nhập lại mật khẩu mới" />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <button type="submit" className="btn btn-primary px-8 shadow-lg shadow-primary/25" disabled={!currentPw || newPw.length < 6 || confirmNewPw !== newPw || pwLoading}>
                      {pwLoading ? <span className="spinner border-t-white" /> : 'Cập nhật mật khẩu'}
                    </button>
                  </div>
                </form>

                {/* Encryption Section */}
                <div className="mt-8 pt-8 border-t border-outline-variant/10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${encEnabled ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
                      {encEnabled ? <ShieldCheck size={20} strokeWidth={2.5} /> : <ShieldAlert size={20} strokeWidth={2.5} />}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-on-surface">Mã hóa dữ liệu (E2EE)</h2>
                      <p className="text-on-surface-variant text-sm">
                        {encEnabled ? 'Dữ liệu mới tải lên sẽ được mã hóa đầu cuối' : 'Dữ liệu chưa được mã hóa'}
                      </p>
                    </div>
                  </div>

                  <div className={`rounded-2xl p-5 border ${encEnabled ? 'bg-green-500/5 border-green-500/20' : 'bg-surface-container-low border-outline-variant/10'}`}>
                    {/* Status Badge */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Lock size={16} className={encEnabled ? 'text-green-500' : 'text-on-surface-variant'} />
                        <span className={`text-sm font-bold uppercase tracking-wider ${encEnabled ? 'text-green-500' : 'text-on-surface-variant'}`}>
                          {encEnabled ? 'Đang bật' : 'Đang tắt'}
                        </span>
                      </div>
                      {encEnabled && (
                        <button
                          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                          onClick={() => setShowRecoverInput(!showRecoverInput)}
                        >
                          <KeyRound size={14} />
                          Khôi phục bằng Recovery Key
                        </button>
                      )}
                    </div>

                    {/* Info Text */}
                    <p className="text-sm text-on-surface-variant mb-4 leading-relaxed">
                      {encEnabled
                        ? 'Tất cả file mới tải lên sẽ tự động được mã hóa. Quản trị viên server không thể đọc được dữ liệu đã mã hóa. Dữ liệu cũ không bị ảnh hưởng.'
                        : 'Bật mã hóa để bảo vệ dữ liệu của bạn. Mỗi file sẽ được mã hóa riêng trước khi lưu trữ, đảm bảo chỉ bạn mới có thể truy cập.'}
                    </p>

                    {/* Recovery Input (only when enabled) */}
                    {showRecoverInput && encEnabled && (
                      <div className="mb-4 p-4 rounded-xl bg-surface-container border border-outline-variant/10 space-y-3 animate-fadeIn">
                        <p className="text-sm font-semibold text-on-surface">Khôi phục mã hóa</p>
                        <p className="text-xs text-on-surface-variant">Sử dụng nếu bạn đã đổi mật khẩu qua admin reset và cần khôi phục quyền truy cập dữ liệu đã mã hóa.</p>
                        <input
                          type="text"
                          className="form-input bg-surface-container-low font-mono text-sm"
                          value={recoverKey}
                          onChange={(e) => setRecoverKey(e.target.value)}
                          placeholder="Nhập Recovery Key (Base58)"
                        />
                        <input
                          type="password"
                          name="recover-password"
                          autoComplete="off"
                          className="form-input bg-surface-container-low text-sm"
                          value={recoverPw}
                          onChange={(e) => setRecoverPw(e.target.value)}
                          placeholder="Mật khẩu hiện tại"
                        />
                        <button
                          className="btn btn-primary px-6 text-sm"
                          onClick={handleRecoverEncryption}
                          disabled={!recoverKey || !recoverPw || encLoading}
                        >
                          {encLoading ? 'Đang xử lý...' : 'Khôi phục'}
                        </button>
                      </div>
                    )}

                    {/* Enable/Disable Password Input */}
                    <div className="flex items-center gap-3">
                      <input
                        type="password"
                        name="confirm-password"
                        autoComplete="new-password"
                        className="form-input bg-surface-container-lowest flex-1 text-sm"
                        value={encPassword}
                        onChange={(e) => setEncPassword(e.target.value)}
                        placeholder="Nhập mật khẩu để xác nhận"
                      />
                      <button
                        className={`btn px-6 text-sm whitespace-nowrap ${encEnabled ? 'btn-secondary' : 'btn-primary shadow-lg shadow-primary/25'}`}
                        onClick={encEnabled ? handleDisableEncryption : handleEnableEncryption}
                        disabled={!encPassword || encLoading}
                      >
                        {encLoading ? 'Đang xử lý...' : (encEnabled ? 'Tắt mã hóa' : 'Bật mã hóa')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'preferences' && profile && (
              <div className="space-y-6">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-on-surface mb-2">Tùy chỉnh giao diện</h2>
                  <p className="text-on-surface-variant text-sm">Cá nhân hóa trải nghiệm của bạn trên MyCloudX.</p>
                </div>

                <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/10 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-on-surface">Kích thước lưới bộ sưu tập</h3>
                    <p className="text-sm text-on-surface-variant mt-1">Số lượng cột hiển thị trên máy tính</p>
                  </div>
                  <select
                    className="form-input w-32 bg-surface-container font-semibold cursor-pointer"
                    value={profile.settings?.gallery_columns || 4}
                    onChange={async (e) => {
                      const cols = parseInt(e.target.value)
                      const updated = await api.updateProfile({ settings: { ...profile.settings, gallery_columns: cols } })
                      setProfile(updated)
                    }}
                  >
                    {[2, 3, 4, 5, 6, 8].map((n) => (
                      <option key={n} value={n}>{n} cột / hàng</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recovery Key Modal */}
      {showRecoveryModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-surface rounded-3xl p-8 w-full max-w-md shadow-2xl border border-outline-variant/20 animate-slideUp">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                <KeyRound size={24} className="text-amber-500" />
              </div>
              <div>
                <h3 className="text-2xl font-bold font-headline text-on-surface tracking-tight">
                  Recovery Key
                </h3>
                <p className="text-sm text-on-surface-variant">Lưu lại ngay — chỉ hiển thị một lần!</p>
              </div>
            </div>

            <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/10 mb-4">
              <p className="text-sm text-on-surface-variant mb-3">
                Đây là khóa khôi phục duy nhất. Nếu bạn quên mật khẩu hoặc được admin reset, bạn cần khóa này để truy cập lại dữ liệu đã mã hóa.
              </p>
              <div className="bg-surface-container rounded-xl p-4 font-mono text-sm text-on-surface break-all select-all border border-outline-variant/10">
                {recoveryKey}
              </div>
            </div>

            <button
              className="w-full btn btn-secondary mb-3 flex items-center justify-center gap-2"
              onClick={copyRecoveryKey}
            >
              <Copy size={16} />
              {copiedRecoveryKey ? 'Đã sao chép!' : 'Sao chép Recovery Key'}
            </button>

            <button
              className="w-full btn btn-primary shadow-lg shadow-primary/25"
              onClick={() => {
                setShowRecoveryModal(false)
                setRecoveryKey('')
                setMessage('Mã hóa đã được kích hoạt thành công!')
                setTimeout(() => setMessage(''), 5000)
              }}
            >
              Tôi đã lưu Recovery Key
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
