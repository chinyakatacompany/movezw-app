import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
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
