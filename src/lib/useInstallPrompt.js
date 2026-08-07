import { useEffect, useState } from "react";

// Chrome fires beforeinstallprompt when the PWA meets installability
// criteria (valid manifest + service worker + HTTPS — already true here),
// then suppresses its own mini-infobar unless we call preventDefault and
// hang onto the event to trigger later from our own button.
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true
  );

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return null;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return choice.outcome;
  };

  return { canInstall: !!deferredPrompt && !installed, installed, promptInstall };
}

// iOS Safari never fires beforeinstallprompt — "Add to Home Screen" only
// exists behind the manual Share sheet there, so that's surfaced as a
// one-line hint instead of a button that would otherwise silently do nothing.
export function isIosSafari() {
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}
