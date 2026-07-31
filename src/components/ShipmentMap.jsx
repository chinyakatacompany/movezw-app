import React, { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const ZW_CENTER = [29.85, -19.0]; // MapLibre uses [lng, lat]

// Free, open vector tiles — no API key, no paid tier. Direct raster tile
// fetches from tile.openstreetmap.org (the previous Leaflet setup) violate
// OSM's tile usage policy for production traffic; OpenFreeMap exists
// specifically to give apps like this a sustainable free alternative.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

function markerEl(color) {
  const el = document.createElement("div");
  el.style.width = "18px";
  el.style.height = "18px";
  el.style.borderRadius = "50%";
  el.style.background = color;
  el.style.border = "2px solid white";
  el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.4)";
  return el;
}

export default function ShipmentMap({ shipments = [], height = 280 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  const markers = shipments.filter((s) => Array.isArray(s.position) && s.position.length === 2);

  useEffect(() => {
    const center = markers[0]?.position ? [markers[0].position[1], markers[0].position[0]] : ZW_CENTER;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center,
      zoom: 6,
      scrollZoom: false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = markers.map((m) => {
      const el = markerEl(m.color || "#1e2f5e");
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14 }).setText(m.label || "");
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([m.position[1], m.position[0]])
        .addTo(map);
      el.addEventListener("mouseenter", () => popup.setLngLat(marker.getLngLat()).addTo(map));
      el.addEventListener("mouseleave", () => popup.remove());
      return marker;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(markers.map((m) => [m.id, m.position, m.color, m.label]))]);

  return (
    <div className="rounded-xl overflow-hidden border border-border bg-muted/30" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
