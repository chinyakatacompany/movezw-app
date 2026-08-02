import React, { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Free, open vector tiles — no API key, no paid tier (see RouteMap.jsx /
// ShipmentMap.jsx for the same pattern).
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
/** @type {[number, number]} */
const ZW_CENTER = [31.0335, -17.8252]; // Harare, [lng, lat]

// Plain live map with no markers/route — just a legible, zoomable backdrop
// for the customer home screen's "Request a Truck" hero.
export default function HomeMap({ height = 260 }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: ZW_CENTER,
      zoom: 12,
      scrollZoom: false,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
