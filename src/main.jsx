import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from '@/App.jsx'
import '@/index.css'

// registerType: 'autoUpdate' (vite.config.js) means "never ask, just take
// over" — sw.js already calls skipWaiting()/clients.claim() so a new
// version activates as soon as it's fetched. The one thing that still
// needs doing manually is telling the currently-running page to reload
// once that happens, and re-checking for updates more often than a
// browser's own ~24h default — otherwise an installed/TWA app that stays
// resident across app-switches can run a stale bundle for a very long time.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    setInterval(() => registration.update(), 60 * 60 * 1000);
  },
  onNeedRefresh() {
    updateSW(true);
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
