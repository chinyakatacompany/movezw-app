import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';

// Share the one-use browser event across every install button and route.
let deferredPrompt = null;
let accepted = false;
let prompting = false;
const listeners = new Set();
const standalone = window.matchMedia?.('(display-mode: standalone)');
const isInstalled = () => accepted || Capacitor.isNativePlatform()
  || !!standalone?.matches || window.navigator.standalone === true;
const emit = () => listeners.forEach((listener) => listener());
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); deferredPrompt = event; emit();
});
window.addEventListener('appinstalled', () => { accepted = true; deferredPrompt = null; emit(); });
standalone?.addEventListener?.('change', emit);
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => `${isInstalled()}:${!!deferredPrompt}:${prompting}`;
const showHelp = () => window.dispatchEvent(new Event('movezw-install-help'));

export function useInstallPrompt() {
  useSyncExternalStore(subscribe, snapshot);
  const installed = isInstalled();
  const promptInstall = async () => {
    if (installed || prompting) return null;
    if (!deferredPrompt) { showHelp(); return null; }
    const event = deferredPrompt;
    deferredPrompt = null; prompting = true; emit();
    try {
      await event.prompt();
      const choice = await event.userChoice;
      return choice.outcome;
    } catch { showHelp(); return null; }
    finally { prompting = false; emit(); }
  };
  return { canInstall: !!deferredPrompt && !installed, showInstall: !installed, installed, promptInstall };
}

export function isIosSafari() {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}
