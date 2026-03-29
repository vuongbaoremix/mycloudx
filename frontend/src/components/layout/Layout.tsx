import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Sidebar from './Sidebar'
import Header from './Header'
import BottomNav from './BottomNav'
import GlobalUploadModal from '../upload/GlobalUploadModal'

export default function Layout() {
  const location = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      <Header onMenuClick={() => setIsMobileMenuOpen(true)} />
      {/* Nội dung chính luôn có padding đệm trên (Header) và đệm dưới (BottomNav mobile) */}
      <main className="flex-1 w-full mx-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 pt-[calc(3rem+env(safe-area-inset-top))] md:pt-[calc(4rem+env(safe-area-inset-top))] px-0 md:pl-64 min-h-screen transition-all duration-300">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full min-h-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav />
      <GlobalUploadModal />
    </div>
  )
}
