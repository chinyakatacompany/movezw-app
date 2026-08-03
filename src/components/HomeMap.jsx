import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreSetup";
import { supabase } from "@/api/supabaseClient";
import { geolocationUnavailableReason } from "@/lib/geo";

// Free, open vector tiles — no API key, no paid tier (see RouteMap.jsx /
// ShipmentMap.jsx for the same pattern).
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
/** @type {[number, number]} */
const ZW_CENTER = [31.0335, -17.8252]; // Harare, [lng, lat]

function driverMarkerEl() {
  const el = document.createElement("div");
  Object.assign(el.style, {
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    background: "#ea580c",
    border: "2.5px solid white",
    boxShadow: "0 2px 5px rgba(0,0,0,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "15px",
  });
  el.textContent = "🚚";
  return el;
}

// OpenFreeMap's style/sprite/glyph fetches occasionally stall on their own
// free, best-effort infra (or a flaky mobile connection) — when that
// happens MapLibre's "load" event never fires and the map sits blank
// forever with no visible error. If load hasn't happened within this
// window, treat it as failed so the UI can offer a retry (a fresh map
// instance means fresh network requests, which usually succeed).
const LOAD_TIMEOUT_MS = 8000;

function myLocationEl() {
  const el = document.createElement("div");
  Object.assign(el.style, {
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    background: "#2563eb",
    border: "3px solid white",
    boxShadow: "0 0 0 8px rgba(37,99,235,0.2), 0 1px 4px rgba(0,0,0,0.3)",
  });
  return el;
}

// Live map backdrop for the customer home screen: real place labels (from
// OpenFreeMap), the customer's own approximate location if granted, and
// nearby online drivers at coarse (not exact) positions — see
// fn_nearby_driver_positions, which rounds coordinates server-side to
// ~1km precision so this screen never exposes a driver's exact live
// location, only roughly where they are.
export default function HomeMap({ height = 260 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const driverMarkersRef = useRef([]);

  useEffect(() => {
    setMapLoaded(false);
    setFailed(false);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: ZW_CENTER,
      zoom: 13,
      scrollZoom: false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on("load", () => setMapLoaded(true));
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    if (mapLoaded) return;
    const timeoutId = setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [mapLoaded, attempt]);

  // My location — best-effort. If permission is denied or the origin isn't
  // secure, this silently keeps the default Harare view instead of erroring.
  useEffect(() => {
    if (!mapLoaded || geolocationUnavailableReason()) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const map = mapRef.current;
        if (!map) return;
        new maplibregl.Marker({ element: myLocationEl() })
          .setLngLat([pos.coords.longitude, pos.coords.latitude])
          .addTo(map);
        map.easeTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 13 });
      },
      () => { /* best-effort — keep the default view */ },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }, [mapLoaded]);

  // Nearby drivers — coarse positions only (see fn_nearby_driver_positions).
  useEffect(() => {
    if (!mapLoaded) return;
    supabase.rpc("fn_nearby_driver_positions").then(({ data, error }) => {
      const map = mapRef.current;
      if (error || !map || !data) return;
      driverMarkersRef.current.forEach((m) => m.remove());
      driverMarkersRef.current = data
        .filter((d) => d.lat != null && d.lng != null)
        .map((d) => new maplibregl.Marker({ element: driverMarkerEl() }).setLngLat([d.lng, d.lat]).addTo(map));
    });
  }, [mapLoaded]);

  return (
    <div style={{ height }} className="relative">
      <div ref={containerRef} className="w-full h-full" />
      {failed && !mapLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/90 rounded-xl">
          <p className="text-xs text-muted-foreground">Map couldn't load</p>
          <button
            type="button"
            onClick={() => { setFailed(false); setAttempt((a) => a + 1); }}
            className="text-xs font-semibold text-primary underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
