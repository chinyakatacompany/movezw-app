import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Free, open vector tiles — no API key, no paid tier (see ShipmentMap.jsx
// for why this replaced direct OSM raster tile fetches).
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

function markerEl(color) {
  const el = document.createElement("div");
  el.style.width = "16px";
  el.style.height = "16px";
  el.style.borderRadius = "50%";
  el.style.background = color;
  el.style.border = "2px solid white";
  el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.4)";
  return el;
}

// Route is fetched once from OSRM's free public routing server (no API key,
// no paid tier) — not continuously re-fetched as the driver moves.
export default function RouteMap({ from, to, height = 260 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [route, setRoute] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
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

    new maplibregl.Marker({ element: markerEl("#1e2f5e") })
      .setLngLat([from.lng, from.lat])
      .setPopup(new maplibregl.Popup({ closeButton: false, offset: 12 }).setText("You"))
      .addTo(map);
    new maplibregl.Marker({ element: markerEl("#059669") })
      .setLngLat([to.lng, to.lat])
      .setPopup(new maplibregl.Popup({ closeButton: false, offset: 12 }).setText("Pickup"))
      .addTo(map);

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          coordinates: r.geometry.coordinates, // [lng, lat] pairs, matches GeoJSON/MapLibre order
          distanceKm: r.distance / 1000,
          durationMin: r.duration / 60,
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
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#1e2f5e", "line-width": 5, "line-opacity": 0.85 },
      });
    }
    map.setLayoutProperty("route-line", "visibility", status === "ready" ? "visible" : "none");

    const bounds = coordinates.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
    map.fitBounds(bounds, { padding: 40, maxZoom: 16 });
  }, [mapLoaded, status, route, from.lat, from.lng, to.lat, to.lng]);

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      <div style={{ height }}>
        <div ref={containerRef} className="w-full h-full" />
      </div>
      <div className="px-3 py-2 bg-muted/40 text-xs text-muted-foreground flex items-center justify-between">
        {status === "loading" && <span>Calculating road route…</span>}
        {status === "error" && <span>Couldn't calculate a driving route — showing straight line.</span>}
        {status === "ready" && route && <span>{route.distanceKm.toFixed(1)} km · ~{Math.round(route.durationMin)} min drive</span>}
      </div>
    </div>
  );
}
