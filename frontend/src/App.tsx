import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { api } from './api/client'
import Login from './pages/Login'
import Register from './pages/Register'
import Gallery from './pages/Gallery'
import Favorites from './pages/Favorites'
import Trash from './pages/Trash'
import Settings from './pages/Settings'
import Albums from './pages/Albums'
import AlbumDetail from './pages/AlbumDetail'
import Admin from './pages/Admin'
import Dashboard from './pages/Dashboard'
import SharedLinks from './pages/SharedLinks'
import MapPage from './pages/Map'
import Mosaic from './pages/Mosaic'
import PublicShare from './pages/PublicShare'
import Layout from './components/layout/Layout'
// import { ReloadPrompt } from './components/pwa/ReloadPrompt'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!api.isAuthenticated()) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <>
      {/* <ReloadPrompt /> */}
      <Toaster
        position="bottom-center"
        richColors
        theme="system"
        toastOptions={{
          className: 'mb-[calc(5rem+env(safe-area-inset-bottom))] md:mb-0'
        }}
      />
      <Routes>
        <Route path="/s/:token" element={<PublicShare />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Gallery />} />
          <Route path="videos" element={<Gallery title="Video" filterMimeType="video/" />} />
          <Route path="favorites" element={<Favorites />} />
          <Route path="trash" element={<Trash />} />
          <Route path="albums" element={<Albums />} />
          <Route path="albums/:id" element={<AlbumDetail />} />
          <Route path="shared" element={<SharedLinks />} />
          <Route path="map" element={<MapPage />} />
          <Route path="mosaic" element={<Mosaic />} />
          <Route path="admin" element={<Admin />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </>
  )
}
