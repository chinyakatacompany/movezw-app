import React, { useState } from "react";
import { MapPin } from "lucide-react";

// Maps are the heaviest thing on most pages (MapLibre GL + vector tile
// fetches, plus an OSRM route fetch for RouteMap) — showing a lightweight
// static placeholder until the driver or customer actually wants to see it
// avoids that cost on every page view, and saves mobile data. children is
// only ever mounted once opened, so a lazy-loaded map inside never triggers
// its network fetch until then.
export default function MapReveal({ height = 260, label = "Tap to view map", children, className = "" }) {
  const [open, setOpen] = useState(false);
  if (open) return children;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      style={{ height }}
      className={`w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 hover:bg-muted/70 transition-colors ${className}`}
    >
      <MapPin className="w-6 h-6 text-primary" />
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
    </button>
  );
}
