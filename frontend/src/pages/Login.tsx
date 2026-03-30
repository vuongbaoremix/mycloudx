import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api/client'
import { APP_LOGO } from '../constants'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.login(email, password)
      navigate('/')
    } catch {
      setError('Email hoặc mật khẩu không đúng')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Left side - Decorative */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-primary/10 items-center justify-center p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,var(--primary),transparent_50%)] opacity-20 animate-breathe" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,var(--tertiary),transparent_50%)] opacity-20 animate-breathe" style={{ animationDelay: '1.5s' }} />
        <div className="absolute inset-0 backdrop-blur-[100px]" />

        <div className="relative z-10 w-full max-w-lg">
          <img src={APP_LOGO} alt="MyCloudX" className="w-24 h-24 object-contain mb-8 drop-shadow-2xl animate-slideUp" />
          <h1 className="text-5xl font-extrabold font-headline mb-6 text-on-surface tracking-tight animate-slideUp" style={{ animationDelay: '100ms' }}>
            Lưu giữ mọi<br />khoảnh khắc của bạn
          </h1>
          <p className="text-xl text-on-surface-variant max-w-md font-body animate-slideUp" style={{ animationDelay: '200ms' }}>
            Nền tảng lưu trữ hình ảnh cá nhân tốc độ cao, an toàn và thông minh với AI.
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_100%_0%,rgba(129,140,248,0.15),transparent_50%)]" />

        <div className="w-full max-w-md relative z-10 animate-fadeIn">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <img src={APP_LOGO} alt="Logo" className="w-12 h-12 object-contain" />
            <div className="flex flex-col items-start translate-y-1">
              <h1 className="text-2xl font-bold font-headline tracking-tight leading-none flex items-center m-0">
                <span className="text-on-surface-variant">My</span>
                <span className="bg-gradient-to-r from-primary to-tertiary bg-clip-text text-transparent">CloudX</span>
              </h1>
              <p className="text-[10px] text-on-surface-variant font-medium tracking-wide uppercase m-0 mt-1">
                Personal Media
              </p>
            </div>
          </div>

          <div className="mb-10 text-center lg:text-left">
            <h2 className="text-3xl font-bold font-headline mb-3 text-on-surface tracking-tight">Đăng nhập</h2>
            <p className="text-on-surface-variant">Chào mừng bạn quay trở lại MyCloudX.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-5">
              <div>
                <label className="form-label">Email</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60 pointer-events-none" data-icon="mail">mail</span>
                  <input
                    type="email"
                    className="form-input pl-11"
                    placeholder="admin@mycloud.local"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Mật khẩu</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60 pointer-events-none" data-icon="lock">lock</span>
                  <input
                    type="password"
                    className="form-input pl-11"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            {error && <p className="form-error bg-error-container/50 px-4 py-3 rounded-xl border border-error-container">{error}</p>}

            <button
              type="submit"
              className="btn btn-primary w-full h-12 text-[15px] rounded-xl font-bold shadow-lg shadow-primary/25"
              disabled={loading}
            >
              {loading ? <span className="spinner border-t-white" /> : 'Đăng nhập'}
            </button>
          </form>

          <p className="text-sm text-on-surface-variant text-center mt-8">
            Chưa có tài khoản?{' '}
            <Link to="/register" className="text-primary font-bold hover:underline underline-offset-4">Đăng ký ngay</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
