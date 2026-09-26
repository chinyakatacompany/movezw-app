import React, { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Navigation, Radio } from "lucide-react";
import { geocodeAddress } from "@/lib/geo";
import { STATUS_FLOW, STATUS_LABELS, timeAgo } from "@/lib/movezw";

const RouteMap = React.lazy(() => import("@/components/RouteMap"));

export default function AdminJobTracker({ job, busy = false, onAdvance }) {
  const [resolved, setResolved] = useState({ pickup: null, destination: null });

  useEffect(() => {
    let active = true;
    setResolved({ pickup: null, destination: null });
    const resolveMissing = async () => {
      const [pickup, destination] = await Promise.all([
        job.pickup_lat == null && job.pickup_location ? geocodeAddress(job.pickup_location) : null,
        job.destination_lat == null && job.destination ? geocodeAddress(job.destination) : null,
      ]);
      if (active) setResolved({ pickup, destination });
    };
    void resolveMissing();
    return () => { active = false; };
  }, [job.id, job.pickup_lat, job.pickup_location, job.destination_lat, job.destination]);

  const pickup = {
    lat: job.pickup_lat ?? resolved.pickup?.lat,
    lng: job.pickup_lng ?? resolved.pickup?.lng,
  };
  const destination = {
    lat: job.destination_lat ?? resolved.destination?.lat,
    lng: job.destination_lng ?? resolved.destination?.lng,
  };
  const trackingTarget = job.status === "en_route_pickup"
    ? { ...pickup, label: "Pickup" }
    : { ...destination, label: "Destination" };
  const hasDriverLocation = job.driver_lat != null && job.driver_lng != null;
  const hasTrackingTarget = trackingTarget.lat != null && trackingTarget.lng != null;
  const hasFullRoute = pickup.lat != null && pickup.lng != null && destination.lat != null && destination.lng != null;
  const showLiveMap = hasDriverLocation && hasTrackingTarget && !["confirmed", "delivered"].includes(job.status);
  const showPlannedMap = !showLiveMap && hasFullRoute;
  const nextStatus = job.status === "delivered"
    ? "completed"
    : STATUS_FLOW[STATUS_FLOW.indexOf(job.status) + 1];

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" /> Live delivery tracking
        </p>
        <span className="text-xs text-muted-foreground">
          {job.driver_location_updated_at ? `Location updated ${timeAgo(job.driver_location_updated_at)}` : "Waiting for driver location"}
        </span>
      </div>

      {showLiveMap ? (
        <React.Suspense fallback={<div className="h-[280px] rounded-xl bg-muted animate-pulse" />}>
          <RouteMap
            from={{ lat: job.driver_lat, lng: job.driver_lng }}
            to={{ lat: trackingTarget.lat, lng: trackingTarget.lng }}
            fromLabel="Driver"
            toLabel={trackingTarget.label}
            fromColor="#ea580c"
            height={280}
          />
        </React.Suspense>
      ) : showPlannedMap ? (
        <React.Suspense fallback={<div className="h-[280px] rounded-xl bg-muted animate-pulse" />}>
          <RouteMap
            from={pickup}
            to={destination}
            fromLabel="Pickup"
            toLabel="Destination"
            height={280}
          />
        </React.Suspense>
      ) : hasDriverLocation ? (
        <a
          href={`https://www.openstreetmap.org/?mlat=${job.driver_lat}&mlon=${job.driver_lng}#map=17/${job.driver_lat}/${job.driver_lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          <Navigation className="w-4 h-4" /> View current driver position
        </a>
      ) : (
        <div className="rounded-xl bg-card border border-border p-3 text-sm text-muted-foreground">
          <p>
            {job.status === "confirmed"
              ? "The driver has not started travelling yet. Live GPS will appear once the trip begins."
              : job.status === "delivered"
                ? "The delivery has arrived and is waiting to be completed."
                : "No recent GPS position is available. Ask the driver to open the active job and enable location access."}
          </p>
          {(job.pickup_location || job.destination) && (
            <p className="mt-2 text-xs">Trying to resolve the saved pickup and destination addresses…</p>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {showLiveMap
          ? `Showing the driver's current position and remaining road route to ${trackingTarget.label.toLowerCase()}.`
          : showPlannedMap
            ? "Showing the planned pickup-to-destination route. The moving driver position appears once GPS sharing starts."
            : "Route mapping needs coordinates from the booking or the driver's current GPS position."}
      </p>

      {nextStatus && onAdvance && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/15 pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Current progress</p>
            <p className="text-sm font-semibold">{STATUS_LABELS[job.status]}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAdvance(job, nextStatus)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Mark as {STATUS_LABELS[nextStatus]}
          </button>
        </div>
      )}
    </div>
  );
}
