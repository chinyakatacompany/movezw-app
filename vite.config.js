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
      // Without this, VitePWA never registers the service worker under
      // `vite dev` — only on a production build/preview. Since the whole
      // push-notification flow (subscribe, receive, click) lives in that
      // worker, testing "Alerts" against the dev server would otherwise
      // just hang forever on navigator.serviceWorker.ready, which never
      // resolves with no worker registered.
      devOptions: {
        enabled: true,
        type: 'module',
      },
      injectManifest: {
        // Precache only the static build output (app shell). Live data
        // (Supabase requests) always goes over the network — this keeps
        // the app installable and fast to load without ever serving
        // stale job/wallet/chat data from a cache.
        globPatterns: ['**/*.{js,css,html,svg,ico}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
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
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    // Vite's esbuild dep pre-bundler mangles maplibre-gl's internal
    // reference to its own Web Worker (maplibre-gl-worker.mjs ends up
    // 404ing from node_modules/.vite/deps), which silently breaks all
    // vector-tile rendering — roads, labels, and any line/route layer never
    // paint, leaving just a flat background color. Excluding it from
    // pre-bundling lets the browser load it straight from node_modules,
    // where its internal worker path resolves correctly.
    exclude: ['maplibre-gl'],
  },
  server: {
    // Needed so requests arriving through a LAN IP or a tunnel (e.g. loca.lt,
    // ngrok) aren't rejected as an unrecognized host during local testing.
    allowedHosts: true,
  },
});
