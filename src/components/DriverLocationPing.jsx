import { useEffect, useRef } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import {
  isLocationTrackingEnabled,
  LOCATION_PREFERENCE_EVENT,
} from "@/lib/devicePreferences";

const PROFILE_REPORT_INTERVAL_MS = 10 * 60 * 1000;
const TRIP_REPORT_INTERVAL_MS = 30 * 1000;
const ACTIVE_TRIP_STATUSES = ["confirmed", "en_route_pickup", "collected", "in_transit"];

// This component lives above the router, so location reporting no longer
// stops when a driver leaves the job-details page. Location starts enabled,
// can be turned off from the driver dashboard, and is shared with an
// accepted job only while that delivery is active.
export default function DriverLocationPing() {
  const { user } = useAuth();
  const profileIdRef = useRef(null);
  const availabilityRef = useRef("offline");
  const activeRequestIdRef = useRef(null);

  useEffect(() => {
    if (!user?.id || user.role !== "driver") return;
    let cancelled = false;
    let watchId = null;
    let lastProfileReportAt = 0;
    let lastTripReportAt = 0;

    const clearWatch = () => {
      if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    };

    const reportPosition = (pos) => {
      if (cancelled || !isLocationTrackingEnabled()) return;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const now = Date.now();

      if (profileIdRef.current && now - lastProfileReportAt >= PROFILE_REPORT_INTERVAL_MS) {
        lastProfileReportAt = now;
        supabase.from("driver_profiles")
          .update({ latitude: lat, longitude: lng })
          .eq("id", profileIdRef.current)
          .then(({ error }) => { if (error) console.error("Failed to save driver location:", error); });
      }

      if (activeRequestIdRef.current && now - lastTripReportAt >= TRIP_REPORT_INTERVAL_MS) {
        lastTripReportAt = now;
        supabase.rpc("fn_update_driver_location", {
          p_request_id: activeRequestIdRef.current,
          p_lat: lat,
          p_lng: lng,
        }).then(({ error }) => { if (error) console.error("Failed to report live trip location:", error); });
      }
    };

    const startTracking = () => {
      clearWatch();
      if (!isLocationTrackingEnabled() || !navigator.geolocation) return;

      // One immediate reading requests permission on a fresh install and
      // refreshes the driver's matching position after every app open.
      navigator.geolocation.getCurrentPosition(reportPosition, () => {}, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 10000,
      });

      // Keep watching across every in-app screen while online or delivering.
      // Android retains final authority if the user revokes permission or
      // switches off GPS in the phone settings.
      if (availabilityRef.current === "online" || activeRequestIdRef.current) {
        watchId = navigator.geolocation.watchPosition(reportPosition, () => {}, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 10000,
        });
      }
    };

    const refreshActiveTrip = async () => {
      const { data } = await supabase.from("transport_requests")
        .select("id")
        .eq("accepted_driver_id", user.id)
        .in("status", ACTIVE_TRIP_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const nextId = data?.id || null;
      if (activeRequestIdRef.current !== nextId) {
        activeRequestIdRef.current = nextId;
        lastTripReportAt = 0;
        startTracking();
      }
    };

    const initialise = async () => {
      const [{ data: profiles }, { data: activeTrip }] = await Promise.all([
        supabase.from("driver_profiles")
          .select("id, availability_status")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase.from("transport_requests")
          .select("id")
          .eq("accepted_driver_id", user.id)
          .in("status", ACTIVE_TRIP_STATUSES)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      profileIdRef.current = profiles?.[0]?.id || null;
      availabilityRef.current = profiles?.[0]?.availability_status || "offline";
      activeRequestIdRef.current = activeTrip?.id || null;
      startTracking();
    };

    const profileChannel = supabase
      .channel(`driver-location-profile-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "driver_profiles", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const nextAvailability = payload.new.availability_status || "offline";
          if (availabilityRef.current !== nextAvailability) {
            availabilityRef.current = nextAvailability;
            startTracking();
          }
        }
      )
      .subscribe();

    const tripChannel = supabase
      .channel(`driver-location-trip-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transport_requests", filter: `accepted_driver_id=eq.${user.id}` },
        () => { void refreshActiveTrip(); }
      )
      .subscribe();

    const onPreference = () => startTracking();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshActiveTrip();
        startTracking();
      }
    };
    window.addEventListener(LOCATION_PREFERENCE_EVENT, onPreference);
    document.addEventListener("visibilitychange", onVisible);
    void initialise();

    return () => {
      cancelled = true;
      clearWatch();
      window.removeEventListener(LOCATION_PREFERENCE_EVENT, onPreference);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(tripChannel);
    };
  }, [user?.id, user?.role]);

  return null;
}
