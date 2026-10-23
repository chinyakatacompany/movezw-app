import { useEffect, useState } from 'react';
import { GOOGLE_MAPS_CONFIG_EVENT, getGoogleMapsSettings } from '@/lib/googleMaps';
import AppErrorBoundary from '@/components/AppErrorBoundary';

// Keep working maps until a valid Google configuration is supplied. A map
// renderer failure must never blank the rest of a driver's delivery screen.
export default function MapProviderSwitch({ google: GoogleMap, fallback: OpenMap, mapProps }) {
  const [settings, setSettings] = useState(null);
  const [resolved, setResolved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () => { void getGoogleMapsSettings().then((value) => { if (active) { setSettings(value); setResolved(true); } }).catch((error) => { console.error(error); if (active) setResolved(true); }); };
    load();
    window.addEventListener(GOOGLE_MAPS_CONFIG_EVENT, load);
    return () => { active = false; window.removeEventListener(GOOGLE_MAPS_CONFIG_EVENT, load); };
  }, []);
  const failure = <div role="alert" className="rounded-xl bg-muted p-6 text-center" style={{ minHeight: 180 }}>
    <p className="text-sm">The map could not open. Your other delivery controls are still available.</p>
    <button onClick={() => setAttempt((n) => n + 1)} className="mt-3 text-primary underline">Retry map</button>
  </div>;
  if (!resolved) return <div role="status" className="flex items-center justify-center bg-muted text-sm" style={{ height: mapProps.height || 260 }}>Loading map…</div>;
  return <AppErrorBoundary key={attempt} fallback={failure}>
    {settings?.key ? <GoogleMap {...mapProps} settings={settings} /> : <OpenMap {...mapProps} />}
  </AppErrorBoundary>;
}
