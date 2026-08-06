import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreSetup";
import { Loader2, Flag, Navigation, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

// Free, open vector tiles — no API key, no paid tier (see ShipmentMap.jsx
// for why this replaced direct OSM raster tile fetches).
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const ROUTE_COLOR = "#2563eb";
// See HomeMap.jsx — OpenFreeMap's style/sprite/glyph fetches occasionally
// stall, leaving MapLibre's "load" event never firing and the map blank
// forever with no visible error. This bounds how long we wait before
// offering a retry (a fresh map instance triggers fresh network requests).
const LOAD_TIMEOUT_MS = 8000;

// Teardrop pin (Google Maps style) instead of a plain dot. Anchored at its
// bottom tip via the Marker's `anchor: "bottom"` option below.
function markerEl(color) {
  const el = document.createElement("div");
  el.style.width = "26px";
  el.style.height = "34px";
  el.style.filter = "drop-shadow(0 2px 3px rgba(0,0,0,0.35))";
  el.innerHTML = `<svg viewBox="0 0 24 32" width="26" height="34" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${color}"/>
    <circle cx="12" cy="12" r="4.5" fill="white"/>
  </svg>`;
  return el;
}

// OSRM breaks a route into one "step" per maneuver, so the same named road
// often spans several consecutive steps (e.g. straight through a few
// intersections). Merge those into one entry per road so the list reads as
// "every road you'll drive on", not a raw maneuver log.
function summarizeSteps(steps) {
  const segments = [];
  for (const step of steps) {
    const isArrive = step.maneuver?.type === "arrive";
    const name = isArrive ? null : (step.name || "Unnamed road");
    const last = segments[segments.length - 1];
    if (!isArrive && last && !last.arrive && last.name === name) {
      last.distanceKm += step.distance / 1000;
    } else {
      segments.push({ name, distanceKm: step.distance / 1000, arrive: isArrive });
    }
  }
  return segments;
}

// Route is fetched once from OSRM's free public routing server (no API key,
// no paid tier) — not continuously re-fetched as the driver moves.
export default function RouteMap({ from, to, height = 260, fromLabel = "You", toLabel = "Pickup", fromColor = "#1e2f5e", toColor = "#059669" }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [route, setRoute] = useState(null);
  const [status, setStatus] = useState("loading");
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    setMapLoaded(false);
    setMapFailed(false);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [from.lng, from.lat],
      zoom: 13,
      scrollZoom: false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on("load", () => setMapLoaded(true));
    // scrollZoom is off (so the map doesn't hijack page scroll), so give
    // people an explicit way to zoom in and actually read street names.
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    new maplibregl.Marker({ element: markerEl(fromColor), anchor: "bottom" })
      .setLngLat([from.lng, from.lat])
      .setPopup(new maplibregl.Popup({ closeButton: false, offset: 20 }).setText(fromLabel))
      .addTo(map);
    new maplibregl.Marker({ element: markerEl(toColor), anchor: "bottom" })
      .setLngLat([to.lng, to.lat])
      .setPopup(new maplibregl.Popup({ closeButton: false, offset: 20 }).setText(toLabel))
      .addTo(map);

    return () => map.remove();
     
  }, [mapAttempt]);

  useEffect(() => {
    if (mapLoaded) return;
    const timeoutId = setTimeout(() => setMapFailed(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [mapLoaded, mapAttempt]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setRoute(null);
    fetch(`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const r = data?.routes?.[0];
        if (data.code !== "Ok" || !r) { setStatus("error"); return; }
        setRoute({
          coordinates: r.geometry.coordinates, // [lng, lat] pairs, matches GeoJSON/MapLibre order
          distanceKm: r.distance / 1000,
          durationMin: r.duration / 60,
          steps: summarizeSteps(r.legs?.[0]?.steps || []),
        });
        setStatus("ready");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [from.lat, from.lng, to.lat, to.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const coordinates = status === "ready" && route ? route.coordinates : [[from.lng, from.lat], [to.lng, to.lat]];
    const geojson = { type: "Feature", geometry: { type: "LineString", coordinates } };

    if (map.getSource("route")) {
      map.getSource("route").setData(geojson);
    } else {
      map.addSource("route", { type: "geojson", data: geojson });
      // White casing underneath the colored line so the route reads clearly
      // against any tile color — the same technique Google Maps uses.
      map.addLayer({
        id: "route-line-casing",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ROUTE_COLOR, "line-width": 6, "line-opacity": 0.95 },
      });
    }
    map.setLayoutProperty("route-line-casing", "visibility", status === "ready" ? "visible" : "none");
    map.setLayoutProperty("route-line", "visibility", status === "ready" ? "visible" : "none");

    const bounds = coordinates.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
    map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
  }, [mapLoaded, status, route, from.lat, from.lng, to.lat, to.lng]);

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      <div className="relative" style={{ height }}>
        <div ref={containerRef} className="w-full h-full" />
        {mapFailed && !mapLoaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-muted/90">
            <p className="text-xs text-muted-foreground">Map couldn't load</p>
            <button
              type="button"
              onClick={() => { setMapFailed(false); setMapAttempt((a) => a + 1); }}
              className="text-xs font-semibold text-primary underline"
            >
              Retry
            </button>
          </div>
        )}
        {/* Floating info card overlaid on the map itself (Google Maps style)
            instead of a separate bar below it. We only ever show what our free
            routing source (OSRM) actually knows — distance/duration and whether
            this is a real road route or a straight-line fallback — not toll
            data, which OSRM's public demo doesn't provide. */}
        <div
          className={cn(
            "absolute left-3 bottom-3 rounded-xl px-3.5 py-2.5 shadow-lg flex items-center gap-2",
            status === "error" ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground"
          )}
        >
          {status === "loading" && (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs font-semibold">Calculating route…</span>
            </>
          )}
          {status === "error" && <span className="text-xs font-semibold">Direct line — road route unavailable</span>}
          {status === "ready" && route && (
            <div className="leading-tight">
              <p className="text-sm font-bold">{Math.round(route.durationMin)} min</p>
              <p className="text-[10px] font-medium opacity-90">{route.distanceKm.toFixed(1)} km · Driving route</p>
            </div>
          )}
        </div>
      </div>

      {/* Every road along the route, in order — merged from OSRM's turn-by-turn
          steps so each road appears once with its total distance. Hidden
          until asked for, so the map stays the default view. */}
      {status === "ready" && route?.steps?.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowSteps((v) => !v)}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 border-t border-border text-sm font-semibold text-primary hover:bg-muted/40 transition-colors"
          >
            <Navigation className="w-4 h-4" />
            <span className="flex-1 text-left">{showSteps ? "Hide turn-by-turn directions" : "Show turn-by-turn directions"}</span>
            {showSteps ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showSteps && (
            <div className="divide-y divide-border border-t border-border max-h-56 overflow-y-auto">
              {route.steps.map((s, i) => (
                <div key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className="w-6 h-6 rounded-full bg-muted text-muted-foreground text-[11px] font-bold flex items-center justify-center shrink-0">
                    {s.arrive ? <Flag className="w-3 h-3" /> : i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium truncate">{s.arrive ? `Arrive at ${toLabel}` : s.name}</span>
                  {!s.arrive && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {s.distanceKm < 1 ? `${Math.round(s.distanceKm * 1000)} m` : `${s.distanceKm.toFixed(1)} km`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
