import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true
  },
  plugins: [
    tailwindcss(),
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.webp', 'ding.mp3', 'finish-*.wav'],
      manifest: {
        name: 'TeaTimer — таймер проливов',
        short_name: 'TeaTimer',
        description: 'Удобный таймер для последовательных чайных проливов',
        theme_color: '#080e18',
        background_color: '#080e18',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'ru',
        icons: [
          { src: 'pwa-192x192.webp', sizes: '192x192', type: 'image/webp' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,webp,mp3,wav,ico}'] }
    })
  ]
})
