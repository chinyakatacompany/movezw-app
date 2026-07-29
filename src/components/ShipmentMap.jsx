import React from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const ZW_CENTER = [-19.0, 29.85];

export default function ShipmentMap({ shipments = [], height = 280 }) {
  const markers = shipments.filter((s) => Array.isArray(s.position) && s.position.length === 2);
  const center = markers[0]?.position || ZW_CENTER;
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-muted/30" style={{ height }}>
      <MapContainer center={center} zoom={6} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        {markers.map((m) => (
          <CircleMarker
            key={m.id}
            center={m.position}
            radius={9}
            pathOptions={{ color: m.color || "#1e2f5e", fillColor: m.color || "#1e2f5e", fillOpacity: 0.85, weight: 2 }}
          >
            <Tooltip direction="top">{m.label}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
