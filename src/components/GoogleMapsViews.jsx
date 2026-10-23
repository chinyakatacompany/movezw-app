import { useEffect, useRef, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import GoogleMapCanvas from '@/components/GoogleMapCanvas';
import { supabase } from '@/api/supabaseClient';
import { requestCurrentLocation } from '@/lib/geo';
import { withTimeout } from '@/lib/withTimeout';

const HARARE = { lat: -17.8252, lng: 31.0335 };

export function GoogleHomeMap({ settings, height = 260, onNearbyDriverCount = undefined, locationRetryToken = 0 }) {
  const [position, setPosition] = useState(null);
  const [drivers, setDrivers] = useState([]);
  useEffect(() => {
    let active = true;
    void requestCurrentLocation({ enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 })
      .then((pos) => { if (active) setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }); })
      .catch(() => { if (active) { setPosition(null); onNearbyDriverCount?.(null); } });
    return () => { active = false; };
  }, [locationRetryToken, onNearbyDriverCount]);
  useEffect(() => {
    if (!position) return;
    let active = true;
    const refresh = async () => {
      try {
        // Retain the existing coarse server-side positions, not precise GPS.
        const { data, error } = await withTimeout(supabase.rpc('fn_nearby_driver_positions_within_radius', { p_lat: position.lat, p_lng: position.lng, p_radius_km: 40 }));
        if (error) throw error;
        if (!active) return;
        const nearby = (data || []).filter((d) => d.lat != null && d.lng != null);
        setDrivers(nearby);
        onNearbyDriverCount?.(nearby.length);
      } catch { if (active) onNearbyDriverCount?.(null); }
    };
    void refresh();
    const timer = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [position, onNearbyDriverCount]);
  const markers = drivers.map((d, i) => ({ id: d.id || i, lat: Number(d.lat), lng: Number(d.lng), icon: '🚚', label: 'Nearby driver (approximate location)' }));
  if (position) markers.push({ id: 'you', ...position, icon: '🔵', label: 'Your location' });
  return <GoogleMapCanvas settings={settings} height={typeof height === "number" ? `${height}px` : height} center={position || HARARE} markers={markers} />;
}

export function GoogleShipmentMap({ settings, shipments = [], height = 280 }) {
  const markers = shipments.filter((s) => Array.isArray(s.position) && s.position.length === 2 && s.position.every((n) => Number.isFinite(Number(n))))
    .map((s) => ({ id: s.id, lat: Number(s.position[0]), lng: Number(s.position[1]), label: s.label || 'Shipment', color: s.color, icon: '🚚' }));
  return <div className="rounded-xl overflow-hidden border" style={{ height }}>
    <GoogleMapCanvas settings={settings} center={markers[0] || HARARE} zoom={6} markers={markers} />
  </div>;
}

export function GooglePinDropMap({ settings, initial = undefined, onConfirm, onClose }) {
  const center = useRef(initial || HARARE);
  const [confirming, setConfirming] = useState(false);
  const [ready, setReady] = useState(false);
  const confirm = async () => {
    setConfirming(true);
    const { lat, lng } = center.current;
    let label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    try {
      // Pinned coordinates remain usable even without a reverse-address label.
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`, { signal: AbortSignal.timeout(8000) });
      const data = await response.json();
      if (data.display_name) label = data.display_name;
    } catch { /* exact pin remains valid */ }
    try { onConfirm({ lat, lng, label }); } finally { setConfirming(false); }
  };
  return <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
    <div className="bg-card w-full sm:max-w-lg sm:rounded-2xl overflow-hidden flex flex-col" style={{ height: 'min(90vh, 560px)' }} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between p-3 border-b">
        <p className="font-semibold text-sm">Move the map to pin the exact spot</p>
        <button type="button" aria-label="Close" onClick={onClose}><X className="w-5 h-5" /></button>
      </div>
      <div className="relative flex-1">
        <GoogleMapCanvas settings={settings} center={initial || HARARE} zoom={initial ? 15 : 12} onCenterChange={(p) => { center.current = p; }} onReadyChange={setReady} />
        {ready && <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-5"><MapPin className="w-8 h-8 text-primary drop-shadow-lg" fill="currentColor" /></div>}
      </div>
      <div className="p-3 border-t"><button type="button" disabled={!ready || confirming} onClick={() => { void confirm(); }} className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">{confirming ? 'Confirming…' : 'Use this location'}</button></div>
    </div>
  </div>;
}

export function GoogleRouteMap({ settings, from, to = undefined, height = 260, fromLabel = 'You', toLabel = 'Pickup', fromColor = '#1e2f5e', toColor = '#059669', immersive = false }) {
  const latestFrom = useRef(from);
  latestFrom.current = from;
  const [route, setRoute] = useState(null);
  const [error, setError] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  useEffect(() => {
    let active = true;
    let running = false;
    let controller;
    setRoute(null);
    setError(false);
    if (!to) return;
    const refresh = async () => {
      if (running) return;
      running = true;
      controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const p = latestFrom.current;
        // Keep the existing OSRM road-distance/ETA source consistent with
        // booking estimates. Google supplies the interactive basemap.
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${p.lng},${p.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`, { signal: controller.signal });
        const data = await response.json();
        if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('Route unavailable');
        if (active) { setRoute(data.routes[0]); setError(false); }
      } catch { if (active) setError(true); }
      finally { running = false; clearTimeout(timer); }
    };
    void refresh();
    const timer = setInterval(refresh, 30000);
    return () => { active = false; controller?.abort(); clearInterval(timer); };
  }, [to?.lat, to?.lng]);
  const markers = [{ id: 'from', ...from, label: fromLabel, color: fromColor, icon: '🚚' }];
  if (to) markers.push({ id: 'to', ...to, label: toLabel, color: toColor, icon: '📍' });
  return <div className={immersive ? 'h-full w-full overflow-hidden' : 'rounded-xl overflow-hidden border'}>
    <div className="relative" style={{ height }}>
      <GoogleMapCanvas settings={settings} center={from} markers={markers} coordinates={route?.geometry?.coordinates || []} follow={immersive} />
      <div className="absolute left-3 bottom-8 rounded-xl bg-primary px-3 py-2 text-primary-foreground shadow-lg">
        <p className="text-sm font-semibold">{route ? `${Math.round(route.duration / 60)} min · ${(route.distance / 1000).toFixed(1)} km` : !to ? 'Live location' : error ? 'Road route unavailable' : 'Calculating route…'}</p>
        {route && <p className="text-[10px]">Driving route{error ? ' · Waiting for an update' : ''}</p>}
      </div>
    </div>
    {!immersive && route?.legs?.[0]?.steps?.length > 0 && <div className="border-t">
      <button type="button" onClick={() => setShowSteps((v) => !v)} className="p-3 text-sm font-semibold text-primary">{showSteps ? 'Hide' : 'Show'} turn-by-turn directions</button>
      {showSteps && <ol className="max-h-56 overflow-auto divide-y">{route.legs[0].steps.map((step, i) => <li key={i} className="px-3 py-2 text-sm">{i + 1}. {step.maneuver?.type === 'arrive' ? `Arrive at ${toLabel}` : step.name || 'Unnamed road'} · {Math.round(step.distance)} m</li>)}</ol>}
    </div>}
  </div>;
}
