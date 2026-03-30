import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['logo.png'],
      manifest: {
        name: 'MyCloudX',
        short_name: 'MyCloudX',
        description: 'Kho lưu trữ phương tiện cá nhân',
        theme_color: '#0f0f13',
        background_color: '#0f0f13',
        display: 'standalone',
        id: '/',
        icons: [
          {
            src: '/logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: './dist',
    emptyOutDir: true,
  },
})
