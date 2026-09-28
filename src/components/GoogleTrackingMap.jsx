import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { cn } from "@/lib/utils";

const ROUTE_REFRESH_INTERVAL_MS = 60 * 1000;
const MARKER_TRANSITION_MS = 8000;

function truckMarkerIcon(maps) {
  return {
    path: "M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z",
    fillColor: "#ea580c",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
    scale: 1.05,
    anchor: new maps.Point(12, 32),
  };
}

function targetMarkerIcon(maps, color) {
  return {
    path: "M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z",
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
    scale: 0.95,
    anchor: new maps.Point(12, 32),
  };
}

export default function GoogleTrackingMap({
  from,
  to,
  height = 260,
  fromLabel = "Driver",
  toLabel = "Destination",
  toColor = "#059669",
  immersive = false,
  onProviderFailure,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapsRef = useRef(null);
  const fromMarkerRef = useRef(null);
  const toMarkerRef = useRef(null);
  const routeLineRef = useRef(null);
  const routeRef = useRef(null);
  const lastRouteRequestRef = useRef(null);
  const markerAnimationRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState(to ? "loading" : "location");
  const [routeSummary, setRouteSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const previousAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      if (!cancelled) onProviderFailure?.();
    };
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        mapsRef.current = maps;
        const map = new maps.Map(containerRef.current, {
          center: from,
          zoom: immersive ? 15.5 : 13,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: immersive ? "greedy" : "cooperative",
          clickableIcons: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        mapRef.current = map;
        fromMarkerRef.current = new maps.Marker({
          map,
          position: from,
          title: fromLabel,
          icon: truckMarkerIcon(maps),
          zIndex: 3,
        });
        if (to) {
          toMarkerRef.current = new maps.Marker({
            map,
            position: to,
            title: toLabel,
            icon: targetMarkerIcon(maps, toColor),
            zIndex: 2,
          });
        }
        routeLineRef.current = new maps.Polyline({
          map,
          strokeColor: "#2563eb",
          strokeOpacity: 0.95,
          strokeWeight: 6,
          geodesic: true,
        });
        setReady(true);
      })
      .catch(() => { if (!cancelled) onProviderFailure?.(); });

    return () => {
      cancelled = true;
      if (markerAnimationRef.current != null) cancelAnimationFrame(markerAnimationRef.current);
      fromMarkerRef.current?.setMap(null);
      toMarkerRef.current?.setMap(null);
      routeLineRef.current?.setMap(null);
      mapRef.current = null;
      window.gm_authFailure = previousAuthFailure;
    };
  }, []);

  // Smooth the truck between Supabase's ten-second GPS reports without
  // recreating the Google map (and therefore without another map load).
  useEffect(() => {
    if (!ready || !fromMarkerRef.current) return;
    const marker = fromMarkerRef.current;
    marker.setTitle(fromLabel);
    if (markerAnimationRef.current != null) cancelAnimationFrame(markerAnimationRef.current);
    const start = marker.getPosition()?.toJSON() || from;
    const startedAt = performance.now();
    const animate = (now) => {
      const progress = Math.min(1, (now - startedAt) / MARKER_TRANSITION_MS);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      marker.setPosition({
        lat: start.lat + (from.lat - start.lat) * eased,
        lng: start.lng + (from.lng - start.lng) * eased,
      });
      if (progress < 1) markerAnimationRef.current = requestAnimationFrame(animate);
      else markerAnimationRef.current = null;
    };
    markerAnimationRef.current = requestAnimationFrame(animate);
  }, [ready, from.lat, from.lng, fromLabel]);

  useEffect(() => {
    if (!ready || !mapsRef.current || !mapRef.current) return;
    const maps = mapsRef.current;
    if (to && !toMarkerRef.current) {
      toMarkerRef.current = new maps.Marker({ map: mapRef.current, zIndex: 2 });
    }
    if (to) {
      toMarkerRef.current.setPosition(to);
      toMarkerRef.current.setTitle(toLabel);
      toMarkerRef.current.setIcon(targetMarkerIcon(maps, toColor));
      toMarkerRef.current.setMap(mapRef.current);
    } else {
      toMarkerRef.current?.setMap(null);
    }
  }, [ready, to?.lat, to?.lng, toLabel, toColor]);

  // OSRM supplies the route line at no Google Routes cost. It refreshes only
  // once per minute; the truck marker still moves with every live GPS update.
  useEffect(() => {
    if (!ready) return;
    if (!to) {
      routeRef.current = null;
      setRouteSummary(null);
      setStatus("location");
      return;
    }
    const now = Date.now();
    const previous = lastRouteRequestRef.current;
    const sameTarget = previous && previous.toLat === to.lat && previous.toLng === to.lng;
    if (routeRef.current && sameTarget && now - previous.at < ROUTE_REFRESH_INTERVAL_MS) return;
    lastRouteRequestRef.current = { at: now, toLat: to.lat, toLng: to.lng };
    if (!routeRef.current) setStatus("loading");
    const controller = new AbortController();
    fetch(`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        const route = data?.routes?.[0];
        if (data.code !== "Ok" || !route) {
          if (!routeRef.current) setStatus("error");
          return;
        }
        routeRef.current = route;
        setRouteSummary({ distanceKm: route.distance / 1000, durationMin: route.duration / 60 });
        routeLineRef.current?.setPath(route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })));
        setStatus("ready");
      })
      .catch((error) => {
        if (error.name !== "AbortError" && !routeRef.current) setStatus("error");
      });
    return () => controller.abort();
  }, [ready, from.lat, from.lng, to?.lat, to?.lng]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (immersive) {
      // Bias the center toward the next stop so the truck sits lower on the
      // screen while staying closely zoomed on its current location.
      const center = to
        ? { lat: from.lat * 0.82 + to.lat * 0.18, lng: from.lng * 0.82 + to.lng * 0.18 }
        : from;
      mapRef.current.setCenter(center);
      mapRef.current.setZoom(15.5);
      return;
    }
    if (to && mapsRef.current) {
      const bounds = new mapsRef.current.LatLngBounds();
      bounds.extend(from);
      bounds.extend(to);
      mapRef.current.fitBounds(bounds, 55);
    } else {
      mapRef.current.setCenter(from);
      mapRef.current.setZoom(15);
    }
  }, [ready, immersive, from.lat, from.lng, to?.lat, to?.lng]);

  return (
    <div className={cn("relative", immersive ? "h-full w-full overflow-hidden" : "rounded-xl overflow-hidden border border-border")} style={{ height }}>
      <div ref={containerRef} className="h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
      <div className={cn(
        "absolute left-3 bottom-3 rounded-xl px-3.5 py-2.5 shadow-lg text-white",
        status === "error" ? "bg-amber-500" : "bg-primary"
      )}>
        {status === "loading" && <span className="text-xs font-semibold">Calculating route…</span>}
        {status === "location" && <span className="text-xs font-semibold">Live location active</span>}
        {status === "error" && <span className="text-xs font-semibold">Live position · Route temporarily unavailable</span>}
        {status === "ready" && routeSummary && (
          <div className="leading-tight">
            <p className="text-sm font-bold">{Math.round(routeSummary.durationMin)} min</p>
            <p className="text-[10px] font-medium opacity-90">{routeSummary.distanceKm.toFixed(1)} km · Live route</p>
          </div>
        )}
      </div>
    </div>
  );
}
