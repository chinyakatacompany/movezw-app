import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMaps';

export default function GoogleMapCanvas({ settings, center, zoom = 13, height = '100%', markers = [], coordinates = [], follow = false, onCenterChange = undefined, onReadyChange = undefined }) {
  const host = useRef(null);
  const mapRef = useRef(null);
  const mapsRef = useRef(null);
  const initial = useRef({ center, zoom });
  const centerCallback = useRef(onCenterChange);
  centerCallback.current = onCenterChange;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);
  useEffect(() => {
    const failed = (event) => { setError(event.detail); setReady(false); };
    window.addEventListener("movezw-google-maps-auth-error", failed);
    return () => window.removeEventListener("movezw-google-maps-auth-error", failed);
  }, []);
  useEffect(() => {
    let active = true;
    let idle;
    setError('');
    setReady(false);
    void loadGoogleMaps(settings.key).then((maps) => {
      if (!active) return;
      mapsRef.current = maps;
      const map = new maps.Map(host.current, {
        center: initial.current.center, zoom: initial.current.zoom, mapId: settings.mapId,
        gestureHandling: 'greedy', zoomControl: true, mapTypeControl: true,
        fullscreenControl: true, streetViewControl: false,
      });
      mapRef.current = map;
      idle = map.addListener('idle', () => {
        const c = map.getCenter();
        if (c) centerCallback.current?.({ lat: c.lat(), lng: c.lng() });
      });
      setReady(true);
    }).catch((error) => { if (active) setError(error.message); });
    return () => {
      active = false;
      idle?.remove();
      if (mapRef.current && mapsRef.current) mapsRef.current.event.clearInstanceListeners(mapRef.current);
      mapRef.current = null;
    };
  }, [settings.key, settings.mapId, attempt]);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!ready || !maps || !map) return;
    const liveMarkers = markers.map((point) => {
      const content = document.createElement('div');
      content.textContent = point.icon || '📍';
      content.style.cssText = `font-size:24px;filter:drop-shadow(0 2px 2px #0006);background:${point.color || '#fff'};border:2px solid white;border-radius:50%;padding:4px;`;
      const marker = new maps.marker.AdvancedMarkerElement({ map, position: { lat: point.lat, lng: point.lng }, content, title: point.label || '' });
      const label = document.createElement('span');
      label.textContent = point.label || '';
      const popup = new maps.InfoWindow({ content: label });
      marker.addListener('click', () => popup.open({ map, anchor: marker }));
      return { marker, popup };
    });
    return () => liveMarkers.forEach(({ marker, popup }) => { popup.close(); maps.event.clearInstanceListeners(marker); marker.map = null; });
  }, [ready, JSON.stringify(markers)]);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!ready || !maps || !map || !coordinates.length) return;
    const path = coordinates.map(([lng, lat]) => ({ lat, lng }));
    const casing = new maps.Polyline({ map, path, strokeColor: '#fff', strokeOpacity: 0.9, strokeWeight: 9 });
    const line = new maps.Polyline({ map, path, strokeColor: '#2563eb', strokeOpacity: 1, strokeWeight: 5 });
    if (!follow) {
      const bounds = new maps.LatLngBounds();
      path.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, 45);
    }
    return () => { casing.setMap(null); line.setMap(null); };
  }, [ready, JSON.stringify(coordinates), follow]);

  useEffect(() => {
    if (!ready || !mapRef.current || !center) return;
    if (follow || !coordinates.length) {
      mapRef.current.panTo(center);
      if (follow) mapRef.current.setZoom(15);
    }
  }, [ready, center?.lat, center?.lng, follow]);

  return <div className="relative w-full h-full" style={{ height }}>
    <div ref={host} className="w-full h-full" aria-label="Interactive Google Map" />
    {!ready && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted p-4 text-center">
      <p role={error ? 'alert' : 'status'} className="text-sm">{error || 'Loading Google Maps…'}</p>
      {error && <button type="button" className="text-primary underline" onClick={() => setAttempt((n) => n + 1)}>Retry map</button>}
    </div>}
  </div>;
}
