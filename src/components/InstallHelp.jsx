import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useInstallPrompt } from '@/lib/useInstallPrompt';

export default function InstallHelp() {
  const [open, setOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const { installed, canInstall, promptInstall } = useInstallPrompt();
  useEffect(() => {
    const show = () => { setCopyMessage(''); setOpen(true); };
    window.addEventListener('movezw-install-help', show);
    return () => window.removeEventListener('movezw-install-help', show);
  }, []);
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  // Share the public entry point, never login tokens or private job URLs.
  const installUrl = `${window.location.origin}/landing`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(installUrl); setCopyMessage('Link copied. Paste it into your browser.'); }
    catch { setCopyMessage('Select and copy the link below, then paste it into your browser.'); }
  };
  return <Dialog open={open && !installed} onOpenChange={setOpen}>
    <DialogContent className="max-w-sm max-h-[85dvh] overflow-y-auto rounded-2xl">
      <DialogTitle>Install MoveZW</DialogTitle>
      <DialogDescription>Add MoveZW to your home screen for easy access.</DialogDescription>
      <p className="text-sm">Opened this link inside WhatsApp, Facebook, Instagram, or another app? Use its menu and choose “Open in browser”. If that option is missing, copy the link below and open it in your browser.</p>
      {ios ? <p className="text-sm">On iPhone or iPad: open the link in Safari, tap Share, then Add to Home Screen and Add. If shown, keep Open as Web App switched on.</p>
        : android ? <p className="text-sm">On Android: open the link in a browser such as Chrome, Edge, Firefox, or Samsung Internet. Look in the browser menu for Install app or Add to Home screen, then follow the prompts. Options vary by browser.</p>
        : <p className="text-sm">On a computer: look for Install in the address bar or browser menu. On supported versions of Safari on Mac, use File → Add to Dock. If no install option is available, try Chrome or Edge.</p>}
      {canInstall && <button onClick={promptInstall} className="rounded-xl bg-primary text-primary-foreground p-3 font-semibold">Install now</button>}
      <button onClick={copy} className="rounded-xl border p-3 font-semibold">Copy MoveZW link</button>
      <input aria-label="MoveZW installation link" readOnly value={installUrl} onFocus={(event) => event.target.select()} className="w-full rounded-lg border bg-background p-2 text-xs" />
      {copyMessage && <p role="status" className="text-sm">{copyMessage}</p>}
      <button onClick={() => setOpen(false)} className="p-2 text-sm">Continue using the website</button>
    </DialogContent>
  </Dialog>;
}
