import React, { useState } from "react";
import GoogleTrackingMap from "@/components/GoogleTrackingMap";
import RouteMap from "@/components/RouteMap";
import { hasGoogleMapsKey } from "@/lib/googleMaps";

// Google is reserved for accepted-job tracking only. If its key, network,
// quota, or script fails, delivery tracking remains available on MapLibre.
export default function TrackingMap(props) {
  const [googleFailed, setGoogleFailed] = useState(false);
  if (!hasGoogleMapsKey() || googleFailed) return <RouteMap {...props} />;
  return <GoogleTrackingMap {...props} onProviderFailure={() => setGoogleFailed(true)} />;
}
