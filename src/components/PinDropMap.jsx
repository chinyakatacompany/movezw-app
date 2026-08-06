import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maplibreSetup";
import { MapPin, Loader2, X } from "lucide-react";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const ZW_CENTER = [31.0335, -17.8252]; // Harare, [lng, lat]

// Fallback for when Nominatim's text search doesn't recognize a place (its
// free OSM data has much thinner coverage of local Zimbabwean businesses
// than Google's geocoder) — a fixed center pin that the map moves under,
// same "drag map, not pin" pattern Uber/Bolt use, so a real coordinate is
// always captured even when the address can't be typed and found.
export default function PinDropMap({ initial, onConfirm, onClose }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const centerRef = useRef(initial || { lat: ZW_CENTER[1], lng: ZW_CENTER[0] });
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: initial ? [initial.lng, initial.lat] : ZW_CENTER,
      zoom: initial ? 15 : 12,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const updateCenter = () => {
      const c = map.getCenter();
      centerRef.current = { lat: c.lat, lng: c.lng };
    };
    map.on("moveend", updateCenter);
    return () => map.remove();
  }, []);

  const confirm = async () => {
    setConfirming(true);
    const { lat, lng } = centerRef.current;
    let label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
      const data = await res.json();
      if (data?.display_name) label = data.display_name;
    } catch (_) {
      // Best-effort — the pinned coordinates are already captured either way.
    }
    onConfirm({ lat, lng, label });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-card w-full sm:max-w-lg sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ height: "min(90vh, 560px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 border-b border-border shrink-0">
          <p className="text-sm font-semibold">Move the map to pin the exact spot</p>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative flex-1">
          <div ref={containerRef} className="w-full h-full" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-5">
            <MapPin className="w-8 h-8 text-primary drop-shadow-lg" fill="currentColor" />
          </div>
        </div>
        <div className="p-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={confirm}
            disabled={confirming}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {confirming && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirming ? "Confirming..." : "Use this location"}
          </button>
        </div>
      </div>
    </div>
  );
}
