import { useEffect, useRef } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

const PING_INTERVAL_MS = 20 * 60 * 1000;

// Silently refreshes a driver's GPS position every 20 minutes while they're
// toggled "Online", overwriting driver_profiles.latitude/longitude in place
// (no location history kept) so distance-to-job matching stays reasonably
// current without full live tracking. Uses only the browser's built-in
// Geolocation API — no paid tracking service.
export default function DriverLocationPing() {
  const { user } = useAuth();
  const profileIdRef = useRef(null);
  const statusRef = useRef("offline");

  useEffect(() => {
    if (!user?.id || user.role !== "driver") return;
    let cancelled = false;

    const capture = () => {
      if (statusRef.current !== "online" || !profileIdRef.current || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          supabase
            .from("driver_profiles")
            .update({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
            .eq("id", profileIdRef.current)
            .then(() => {});
        },
        () => {}, // silent — don't interrupt the driver if permission was denied
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 }
      );
    };

    supabase
      .from("driver_profiles")
      .select("id, availability_status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (cancelled) return;
        const p = data?.[0];
        profileIdRef.current = p?.id || null;
        statusRef.current = p?.availability_status || "offline";
        if (statusRef.current === "online") capture();
      });

    const channel = supabase
      .channel(`driver-location-ping-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "driver_profiles", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const wasOnline = statusRef.current === "online";
          statusRef.current = payload.new.availability_status || "offline";
          if (!wasOnline && statusRef.current === "online") capture();
        }
      )
      .subscribe();

    const interval = setInterval(capture, PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.role]);

  return null;
}
