import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import AppErrorBoundary from '@/components/AppErrorBoundary'
import { withTimeout } from '@/lib/withTimeout'
import '@/index.css'

// The APK already contains the app shell. A PWA worker on https://localhost
// can retain chunks from an older APK across an upgrade. Only web uses PWA caching.
let nativeReady = Promise.resolve();
if (Capacitor.isNativePlatform()) {
  if ('serviceWorker' in navigator) {
    nativeReady = withTimeout(navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((r) => r.unregister()))), 5000)
      .catch((error) => console.error('Could not remove native web cache:', error));
  }
} else {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onRegisteredSW(_url, registration) {
        if (registration) setInterval(() => { void registration.update().catch(console.error); }, 60 * 60 * 1000);
      },
      onNeedRefresh() { void updateSW(true); },
    });
  }).catch((error) => console.error('Web update registration failed:', error));
}

// Load the app separately: configuration/import failures must leave a useful
// message instead of erasing the native startup screen with a blank WebView.
nativeReady.then(() => import('@/App.jsx')).then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <AppErrorBoundary><App /></AppErrorBoundary>
  );
}).catch((error) => {
  console.error('MoveZW startup failed:', error);
  const startup = document.getElementById('startup-status');
  if (startup) startup.textContent = 'MoveZW could not start. Close and reopen the app. If this continues, update MoveZW and Android System WebView.';
});
