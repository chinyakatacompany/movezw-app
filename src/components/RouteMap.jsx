import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function FitToRoute({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length >= 2) map.fitBounds(positions, { padding: [24, 24] });
  }, [positions, map]);
  return null;
}

// Route is fetched once from OSRM's free public routing server (no API key,
// no paid tier) — not continuously re-fetched as the driver moves.
export default function RouteMap({ from, to, height = 260 }) {
  const [route, setRoute] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setRoute(null);
    fetch(`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const r = data?.routes?.[0];
        if (data.code !== "Ok" || !r) { setStatus("error"); return; }
        setRoute({
          positions: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
          distanceKm: r.distance / 1000,
          durationMin: r.duration / 60,
        });
        setStatus("ready");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [from.lat, from.lng, to.lat, to.lng]);

  const fallback = [[from.lat, from.lng], [to.lat, to.lng]];
  const positions = route?.positions || fallback;

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      <div style={{ height }}>
        <MapContainer center={[from.lat, from.lng]} zoom={13} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
          <CircleMarker center={[from.lat, from.lng]} radius={8} pathOptions={{ color: "#1e2f5e", fillColor: "#1e2f5e", fillOpacity: 0.9, weight: 2 }}>
            <Tooltip direction="top">You</Tooltip>
          </CircleMarker>
          <CircleMarker center={[to.lat, to.lng]} radius={8} pathOptions={{ color: "#059669", fillColor: "#059669", fillOpacity: 0.9, weight: 2 }}>
            <Tooltip direction="top">Pickup</Tooltip>
          </CircleMarker>
          {status === "ready" && <Polyline positions={positions} pathOptions={{ color: "#1e2f5e", weight: 5, opacity: 0.85 }} />}
          <FitToRoute positions={positions} />
        </MapContainer>
      </div>
      <div className="px-3 py-2 bg-muted/40 text-xs text-muted-foreground flex items-center justify-between">
        {status === "loading" && <span>Calculating road route…</span>}
        {status === "error" && <span>Couldn't calculate a driving route — showing straight line.</span>}
        {status === "ready" && <span>{route.distanceKm.toFixed(1)} km · ~{Math.round(route.durationMin)} min drive</span>}
      </div>
    </div>
  );
}
