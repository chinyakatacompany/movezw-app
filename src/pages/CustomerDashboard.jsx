import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useUnexpiredRequests } from "@/lib/useUnexpiredRequests";
import { Plus, Truck, ArrowRight, ChevronRight, Bell, Package, Phone, Download, MessageCircle, Navigation } from "lucide-react";
import { STATUS_FLOW, STATUS_LABELS } from "@/lib/movezw";
import { cn } from "@/lib/utils";
import { useInstallPrompt } from "@/lib/useInstallPrompt";
const HomeMap = React.lazy(() => import("@/components/HomeMap"));
const RouteMap = React.lazy(() => import("@/components/RouteMap"));

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [allRequests, setRequests] = useState(null);
  const requests = useUnexpiredRequests(allRequests);
  const openRequests = (requests || []).filter((request) => request.status === "open");
  const openRequestKey = openRequests.map((request) => request.id).join(",");
  const [onlineDrivers, setOnlineDrivers] = useState(0);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [tripPhone, setTripPhone] = useState(null);
  const [acceptedDriverLocation, setAcceptedDriverLocation] = useState(null);
  const [offerCounts, setOfferCounts] = useState({});
  // Customers now sign up and land straight on this page (see Register.jsx's
  // frictionless anonymous signup) without ever passing through Login.jsx /
  // AuthLayout, which is where the install prompt used to live for them —
  // so it needs its own spot here instead.
  const { showInstall, promptInstall } = useInstallPrompt();

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("transport_requests")
      .select("*")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) { setRequests([]); return; }
        setRequests(data);
      });
  }, [user?.id]);

  // Keep "Trip in progress" live: the moment a driver marks a job en route,
  // collected, in transit, etc., this updates without the customer needing
  // to reload the home screen.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`customer-dashboard-requests-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "transport_requests", filter: `customer_id=eq.${user.id}` }, (payload) => {
        setRequests((cur) => (cur ? cur.map((r) => (r.id === payload.new.id ? payload.new : r)) : cur));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transport_requests", filter: `customer_id=eq.${user.id}` }, (payload) => {
        setRequests((cur) => (cur ? [payload.new, ...cur] : cur));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  useEffect(() => {
    supabase.rpc("fn_online_driver_count").then(({ data, error }) => {
      if (!error) setOnlineDrivers(data || 0);
    });
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const refreshUnread = () => {
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false)
        .then(({ count, error }) => {
          if (active && !error) setUnreadAlerts(count || 0);
        });
    };
    refreshUnread();
    const channel = supabase
      .channel(`customer-home-alert-count-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, refreshUnread)
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [user?.id]);

  const active = (requests || []).filter((x) => !["completed", "cancelled"].includes(x.status));
  const inTransit = active.find((x) => STATUS_FLOW.includes(x.status) || x.status === "delivered");

  // Switch to the assigned driver's map as soon as an offer is accepted.
  // Before the first live trip ping arrives, seed the marker with that
  // driver's most recent matching location; live request coordinates replace
  // it automatically on the next Realtime/poll update.
  useEffect(() => {
    if (!inTransit?.id || !inTransit.accepted_driver_id) {
      setAcceptedDriverLocation(null);
      return;
    }
    if (inTransit.driver_lat != null && inTransit.driver_lng != null) {
      setAcceptedDriverLocation(null);
      return;
    }
    let mounted = true;
    supabase.rpc("fn_get_assigned_driver_location", { p_request_id: inTransit.id })
      .then(({ data, error }) => {
        if (!mounted || error) return;
        const location = Array.isArray(data) ? data[0] : data;
        setAcceptedDriverLocation(location?.latitude != null && location?.longitude != null
          ? { lat: location.latitude, lng: location.longitude }
          : null);
      });
    return () => { mounted = false; };
  }, [inTransit?.id, inTransit?.accepted_driver_id, inTransit?.driver_lat, inTransit?.driver_lng]);

  // Realtime is the fast path, while this ten-second refresh is a safety net
  // for mobile networks that briefly disconnect a websocket. It updates only
  // the active request, so the customer map keeps following the driver's
  // latest coordinates without reloading the whole dashboard.
  useEffect(() => {
    if (!user?.id || !inTransit?.id) return;
    let mounted = true;
    const refreshTrackedRequest = async () => {
      const { data, error } = await supabase
        .from("transport_requests")
        .select("*")
        .eq("id", inTransit.id)
        .eq("customer_id", user.id)
        .maybeSingle();
      if (!mounted || error || !data) return;
      setRequests((current) => current
        ? current.map((request) => (request.id === data.id ? data : request))
        : [data]);
    };
    void refreshTrackedRequest();
    const intervalId = window.setInterval(refreshTrackedRequest, 10 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshTrackedRequest();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, inTransit?.id]);

  // Open jobs remain easy to return to after the customer leaves the live
  // request page. Quote counts refresh in real time so "View quotes" does
  // not depend on the customer noticing a notification first.
  useEffect(() => {
    if (!user?.id || !openRequestKey) { setOfferCounts({}); return; }
    let mounted = true;
    const requestIds = openRequestKey.split(",");
    const refreshOfferCounts = async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("request_id")
        .in("request_id", requestIds)
        .eq("status", "pending");
      if (error) { console.error("Failed to load quote counts:", error); return; }
      if (!mounted) return;
      setOfferCounts((data || []).reduce((counts, offer) => {
        counts[offer.request_id] = (counts[offer.request_id] || 0) + 1;
        return counts;
      }, {}));
    };
    void refreshOfferCounts();
    const channel = supabase
      .channel(`customer-dashboard-offers-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "offers" }, refreshOfferCounts)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [user?.id, openRequestKey]);

  useEffect(() => {
    if (!inTransit?.id) { setTripPhone(null); return; }
    let cancelled = false;
    supabase.rpc("fn_get_trip_contact_phone", { p_request_id: inTransit.id })
      .then(({ data, error }) => { if (!cancelled && !error) setTripPhone(data || null); });
    return () => { cancelled = true; };
  }, [inTransit?.id]);

  // An active delivery turns Home into the tracking screen. Because this
  // stays inside AppLayout, the normal Home / Request / Me navigation is
  // always visible instead of being covered by a separate full-screen page.
  if (inTransit) {
    const goingToPickup = ["confirmed", "en_route_pickup"].includes(inTransit.status);
    const targetLat = goingToPickup ? inTransit.pickup_lat : inTransit.destination_lat;
    const targetLng = goingToPickup ? inTransit.pickup_lng : inTransit.destination_lng;
    const trackingTarget = targetLat != null && targetLng != null
      ? { lat: targetLat, lng: targetLng, label: goingToPickup ? "Pickup" : "Destination" }
      : null;
    const liveDriverLocation = inTransit.driver_lat != null && inTransit.driver_lng != null
      ? { lat: inTransit.driver_lat, lng: inTransit.driver_lng }
      : null;
    const displayedDriverLocation = liveDriverLocation || acceptedDriverLocation;
    const hasDriverLocation = Boolean(displayedDriverLocation);
    const mapHeight = "calc(100dvh - 7.5rem)";

    return (
      <div className="relative overflow-hidden -mb-20" style={{ height: mapHeight }}>
        {hasDriverLocation ? (
          <React.Suspense fallback={<div className="absolute inset-0 bg-muted animate-pulse" />}>
            <RouteMap
              from={displayedDriverLocation}
              to={trackingTarget}
              fromLabel="Your driver"
              toLabel={trackingTarget?.label || "Route target"}
              fromColor="#ea580c"
              height={mapHeight}
              immersive
            />
          </React.Suspense>
        ) : (
          <React.Suspense fallback={<div className="absolute inset-0 bg-muted animate-pulse" />}>
            <HomeMap height={mapHeight} />
          </React.Suspense>
        )}

        <div className="absolute top-3 left-3 right-16 rounded-2xl bg-primary text-primary-foreground px-4 py-3 shadow-lg text-center">
          <p className="text-[10px] font-semibold text-primary-foreground/75">LIVE DELIVERY TRACKING</p>
          <p className="font-bold">{STATUS_LABELS[inTransit.status]}</p>
          {!hasDriverLocation && <p className="text-xs text-primary-foreground/80 mt-1">Driver assigned · waiting for the first GPS position</p>}
        </div>

        <Link
          to="/customer/notifications"
          aria-label="Alerts"
          className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white text-slate-900 shadow-lg flex items-center justify-center"
        >
          <Bell className="w-5 h-5 text-primary" />
          {unreadAlerts > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadAlerts > 9 ? "9+" : unreadAlerts}
            </span>
          )}
        </Link>

        <div className="absolute top-24 right-3 max-w-[65%] rounded-xl bg-emerald-500 text-white px-3 py-2 shadow-lg text-right">
          <p className="text-[9px] font-bold opacity-80">DESTINATION</p>
          <p className="text-xs font-semibold truncate">{inTransit.destination}</p>
        </div>

        <div className="absolute left-3 top-24 flex flex-col gap-3">
          <Link to={`/customer/request/${inTransit.id}?details=1`} className="w-16 min-h-16 rounded-2xl bg-white/95 shadow-lg border border-border flex flex-col items-center justify-center gap-1 px-1 text-[11px] font-bold text-slate-900">
            <Truck className="w-5 h-5 text-primary" /> View offer
          </Link>
          {tripPhone && (
            <a href={`tel:${tripPhone}`} className="w-16 min-h-16 rounded-2xl bg-white/95 shadow-lg border border-border flex flex-col items-center justify-center gap-1 text-[11px] font-bold text-slate-900">
              <Phone className="w-5 h-5 text-primary" /> Call
            </a>
          )}
        </div>

        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 max-w-[75%] rounded-xl bg-white/95 text-slate-900 px-3 py-2 shadow-lg text-center border border-border">
          <p className="text-[9px] font-bold text-primary">PICKUP</p>
          <p className="text-xs font-semibold truncate">{inTransit.pickup_location}</p>
        </div>

        <div className="absolute bottom-3 inset-x-3 rounded-2xl bg-primary text-primary-foreground px-4 py-3 shadow-lg flex items-center gap-3">
          <Navigation className="w-5 h-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-primary-foreground/75">CURRENT STATUS</p>
            <p className="text-sm font-bold truncate">{STATUS_LABELS[inTransit.status]}</p>
          </div>
          <Link to={`/customer/request/${inTransit.id}?details=1`} className="text-xs font-bold bg-white/15 rounded-xl px-3 py-2">Details</Link>
        </div>
      </div>
    );
  }

  const mapHeight = "calc(100dvh - 7.5rem)";

  return (
    <div className="relative overflow-hidden -mb-20" style={{ height: mapHeight }}>
      <React.Suspense fallback={<div className="absolute inset-0 bg-muted animate-pulse" />}>
        <HomeMap height={mapHeight} />
      </React.Suspense>

      <div className="absolute top-3 left-3 bg-card/95 backdrop-blur rounded-full pl-2.5 pr-3 py-2 shadow-lg flex items-center gap-1.5 text-xs font-semibold text-foreground pointer-events-none">
        <Truck className="w-3.5 h-3.5 text-primary" />
        {onlineDrivers} driver{onlineDrivers === 1 ? "" : "s"} nearby
      </div>

      <Link
        to="/customer/notifications"
        aria-label="Alerts"
        className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white text-slate-900 shadow-lg flex items-center justify-center"
      >
        <Bell className="w-5 h-5 text-primary" />
        {unreadAlerts > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadAlerts > 9 ? "9+" : unreadAlerts}
          </span>
        )}
      </Link>

      {showInstall && (
        <button
          type="button"
          onClick={promptInstall}
          className="absolute top-16 left-3 w-16 min-h-16 rounded-2xl bg-accent text-accent-foreground shadow-lg flex flex-col items-center justify-center gap-1 px-1 text-[10px] font-bold"
        >
          <Download className="w-5 h-5" /> Install app
        </button>
      )}

      {openRequests.length > 0 ? (
        <div className="absolute inset-x-0 bottom-3 flex gap-3 overflow-x-auto px-3 pb-1 snap-x snap-mandatory">
          {openRequests.map((request) => {
            const quoteCount = offerCounts[request.id] || 0;
            return (
              <Link
                key={request.id}
                to={`/customer/request/${request.id}`}
                className="min-w-[86%] snap-center bg-white/95 backdrop-blur rounded-2xl border border-border p-4 shadow-xl text-slate-900"
              >
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold truncate">{request.cargo_type}</p>
                      {request.batch_total > 1 && <span className="text-[10px] font-bold text-accent">Load {request.batch_index}/{request.batch_total}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{request.pickup_location} → {request.destination}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", quoteCount > 0 ? "text-red-600" : "text-muted-foreground")}>
                        <MessageCircle className="w-3.5 h-3.5" />
                        {quoteCount > 0 ? `${quoteCount} quote${quoteCount === 1 ? "" : "s"} received` : "Waiting for quotes"}
                      </span>
                      <span className="text-xs text-primary font-bold inline-flex items-center gap-1">
                        {quoteCount > 0 ? "View quotes" : "View job"} <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <Link
          to="/customer/new"
          className="absolute left-3 right-3 bottom-3 bg-primary text-primary-foreground rounded-2xl px-4 py-3.5 shadow-xl flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
            <Plus className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Request a Truck</p>
            <p className="text-xs text-primary-foreground/80">Get quotes from nearby drivers</p>
          </div>
          <ChevronRight className="w-5 h-5 shrink-0" />
        </Link>
      )}
    </div>
  );
}
