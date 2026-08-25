import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.webp', 'ding.mp3', 'tea-*.png'],
      manifest: {
        name: 'TeaTimer — таймер проливов',
        short_name: 'TeaTimer',
        description: 'Удобный таймер для последовательных чайных проливов',
        theme_color: '#f9f1e7',
        background_color: '#f9f1e7',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'ru',
        icons: [
          { src: 'pwa-192x192.webp', sizes: '192x192', type: 'image/webp' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,webp,mp3,ico}'] }
    })
  ]
})
