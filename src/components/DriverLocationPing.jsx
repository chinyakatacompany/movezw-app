import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { BackgroundGeolocation } from "@capgo/background-geolocation";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { isLocationTrackingEnabled, LOCATION_PREFERENCE_EVENT } from "@/lib/devicePreferences";

const PROFILE_REPORT_INTERVAL_MS = 10 * 60 * 1000;
const TRIP_REPORT_INTERVAL_MS = 10 * 1000;
const ACTIVE_TRIP_STATUSES = ["confirmed", "en_route_pickup", "collected", "in_transit"];
const BACKGROUND_FUNCTION = "driver-location-background";
const BACKGROUND_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${BACKGROUND_FUNCTION}`;
const SUPABASE_PUBLIC_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Web/PWA drivers use browser geolocation while MoveZW is open. During an
// active delivery, the installed Android app instead starts a native foreground
// service whose persistent notification makes background location use visible.
export default function DriverLocationPing() {
  const { user } = useAuth();
  const profileIdRef = useRef(null);
  const availabilityRef = useRef("offline");
  const activeRequestIdRef = useRef(null);

  useEffect(() => {
    if (!user?.id || user.role !== "driver") return;

    const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
    let cancelled = false;
    let watchId = null;
    let lastProfileReportAt = 0;
    let lastTripReportAt = 0;
    let nativeRequestId = null;
    let nativeTargetId = null;
    let nativeInitialised = false;
    let nativeGeneration = 0;

    const clearWatch = () => {
      if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    };

    const saveProfilePosition = (lat, lng) => {
      const now = Date.now();
      if (!profileIdRef.current || now - lastProfileReportAt < PROFILE_REPORT_INTERVAL_MS) return;
      lastProfileReportAt = now;
      supabase.from("driver_profiles")
        .update({ latitude: lat, longitude: lng })
        .eq("id", profileIdRef.current)
        .then(({ error }) => { if (error) console.error("Failed to save driver location:", error); });
    };

    const reportBrowserPosition = (pos) => {
      if (cancelled || !isLocationTrackingEnabled()) return;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      saveProfilePosition(lat, lng);

      const now = Date.now();
      if (activeRequestIdRef.current && now - lastTripReportAt >= TRIP_REPORT_INTERVAL_MS) {
        lastTripReportAt = now;
        supabase.rpc("fn_update_driver_location", {
          p_request_id: activeRequestIdRef.current,
          p_lat: lat,
          p_lng: lng,
        }).then(({ error }) => { if (error) console.error("Failed to report live trip location:", error); });
      }
    };

    const revokeNativeSession = (requestId) => {
      if (!requestId) return;
      void supabase.functions.invoke(BACKGROUND_FUNCTION, {
        body: { action: "stop", request_id: requestId },
      });
    };

    const configureNativeTracking = async (requestId) => {
      if (!isNativeAndroid) return;
      const targetId = requestId && isLocationTrackingEnabled() ? requestId : null;
      if (nativeInitialised && nativeTargetId === targetId) return;

      const generation = ++nativeGeneration;
      const previousId = nativeRequestId;
      nativeTargetId = targetId;
      nativeRequestId = null;
      nativeInitialised = true;

      try {
        await BackgroundGeolocation.stop();
      } catch {
        // The first stop normally finds no active native watcher.
      }
      if (previousId && previousId !== targetId) revokeNativeSession(previousId);
      if (!targetId || cancelled || generation !== nativeGeneration) return;

      const { data, error } = await supabase.functions.invoke(BACKGROUND_FUNCTION, {
        body: { action: "start", request_id: targetId },
      });
      if (error || !data?.tracking_token) {
        if (generation === nativeGeneration) {
          nativeTargetId = null;
          nativeInitialised = false;
        }
        console.error("Failed to authorise background trip tracking:", error || data?.error);
        return;
      }
      if (cancelled || generation !== nativeGeneration) {
        revokeNativeSession(targetId);
        return;
      }

      try {
        await BackgroundGeolocation.start(
          {
            backgroundTitle: "MoveZW delivery tracking",
            backgroundMessage: "Live location is being shared for your active delivery",
            requestPermissions: true,
            stale: false,
            distanceFilter: 0,
            minIntervalMs: TRIP_REPORT_INTERVAL_MS,
            networkFallback: true,
            url: BACKGROUND_FUNCTION_URL,
            headers: {
              apikey: SUPABASE_PUBLIC_KEY,
              Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
              "x-movezw-request-id": targetId,
              "x-movezw-tracking-token": data.tracking_token,
            },
          },
          (position, backgroundError) => {
            if (backgroundError) {
              console.error("Background location error:", backgroundError);
              return;
            }
            if (position) saveProfilePosition(position.latitude, position.longitude);
          },
        );
        if (cancelled || generation !== nativeGeneration) {
          await BackgroundGeolocation.stop();
          revokeNativeSession(targetId);
          return;
        }
        nativeRequestId = targetId;
      } catch (backgroundError) {
        if (generation === nativeGeneration) {
          nativeTargetId = null;
          nativeInitialised = false;
        }
        revokeNativeSession(targetId);
        console.error("Could not start MoveZW background tracking:", backgroundError);
      }
    };

    const configureTracking = () => {
      clearWatch();
      if (!isLocationTrackingEnabled()) {
        void configureNativeTracking(null);
        return;
      }
      if (isNativeAndroid && activeRequestIdRef.current) {
        void configureNativeTracking(activeRequestIdRef.current);
        return;
      }

      void configureNativeTracking(null);
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(reportBrowserPosition, () => {}, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 10000,
      });
      if (availabilityRef.current === "online" || activeRequestIdRef.current) {
        watchId = navigator.geolocation.watchPosition(reportBrowserPosition, () => {}, {
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
        configureTracking();
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
      configureTracking();
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
            configureTracking();
          }
        },
      )
      .subscribe();

    const tripChannel = supabase
      .channel(`driver-location-trip-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transport_requests", filter: `accepted_driver_id=eq.${user.id}` },
        () => { void refreshActiveTrip(); },
      )
      .subscribe();

    const onPreference = () => configureTracking();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshActiveTrip();
        configureTracking();
      }
    };
    window.addEventListener(LOCATION_PREFERENCE_EVENT, onPreference);
    document.addEventListener("visibilitychange", onVisible);
    void initialise();

    return () => {
      cancelled = true;
      nativeGeneration += 1;
      clearWatch();
      if (isNativeAndroid) {
        void BackgroundGeolocation.stop();
        revokeNativeSession(nativeRequestId || activeRequestIdRef.current);
      }
      window.removeEventListener(LOCATION_PREFERENCE_EVENT, onPreference);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(tripChannel);
    };
  }, [user?.id, user?.role]);

  return null;
}
