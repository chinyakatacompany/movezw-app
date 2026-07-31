import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        // Precache only the static build output (app shell). Live data
        // (Supabase requests) always goes over the network — this keeps
        // the app installable and fast to load without ever serving
        // stale job/wallet/chat data from a cache.
        globPatterns: ['**/*.{js,css,html,svg,ico}'],
      },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'MoveZW',
        short_name: 'MoveZW',
        description: 'Book verified drivers to move your cargo anywhere in Zimbabwe.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1e2f5e',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Needed so requests arriving through a LAN IP or a tunnel (e.g. loca.lt,
    // ngrok) aren't rejected as an unrecognized host during local testing.
    allowedHosts: true,
  },
});
