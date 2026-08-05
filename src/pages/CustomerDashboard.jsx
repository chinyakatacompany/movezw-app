import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Plus, Truck, ArrowRight, ChevronRight, Bell, Package, Flag, Star, Phone, User as UserIcon } from "lucide-react";
import { STATUS_FLOW } from "@/lib/movezw";
import { cn } from "@/lib/utils";
const HomeMap = React.lazy(() => import("@/components/HomeMap"));

const TRIP_STEPS = [
  { id: "en_route_pickup", label: "En route to pickup", icon: Truck },
  { id: "collected", label: "At pickup", icon: Package },
  { id: "in_transit", label: "In transit", icon: Truck },
  { id: "delivered", label: "Delivered", icon: Flag },
];

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [requests, setRequests] = useState(null);
  const [onlineDrivers, setOnlineDrivers] = useState(0);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [tripDriver, setTripDriver] = useState(null);
  const [tripPhone, setTripPhone] = useState(null);

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
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
      .then(({ count, error }) => {
        if (!error) setUnreadAlerts(count || 0);
      });
  }, [user?.id]);

  const active = (requests || []).filter((x) => !["completed", "cancelled"].includes(x.status));
  const inTransit = active.find((x) => STATUS_FLOW.includes(x.status));
  const tripStepIndex = inTransit ? TRIP_STEPS.findIndex((s) => s.id === inTransit.status) : -1;

  useEffect(() => {
    if (!inTransit?.accepted_offer_id) { setTripDriver(null); setTripPhone(null); return; }
    let cancelled = false;
    supabase.from("offers").select("*").eq("id", inTransit.accepted_offer_id).single()
      .then(({ data, error }) => { if (!cancelled && !error) setTripDriver(data || null); });
    supabase.rpc("fn_get_trip_contact_phone", { p_request_id: inTransit.id })
      .then(({ data, error }) => { if (!cancelled && !error) setTripPhone(data || null); });
    return () => { cancelled = true; };
  }, [inTransit?.accepted_offer_id, inTransit?.id]);

  return (
    <div className="pb-2">
      <div className="relative h-64 overflow-hidden rounded-b-3xl">
        <React.Suspense fallback={<div className="w-full h-full bg-muted animate-pulse" />}>
          <HomeMap height={256} />
        </React.Suspense>
        <div className="absolute top-3 left-3 bg-white/95 backdrop-blur rounded-full pl-2.5 pr-3 py-1.5 shadow flex items-center gap-1.5 text-xs font-semibold text-foreground pointer-events-none">
          <Truck className="w-3.5 h-3.5 text-primary" />
          {onlineDrivers} driver{onlineDrivers === 1 ? "" : "s"} nearby
        </div>
        <Link
          to="/customer/new"
          className="absolute left-3 right-3 bottom-3 bg-primary text-primary-foreground rounded-2xl px-4 py-3.5 shadow-lg flex items-center gap-3 hover:bg-primary/90 transition-colors"
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
      </div>

      <div className="p-4 space-y-6">
        <Link to="/alerts" className="flex items-center gap-3 bg-white rounded-2xl border border-border p-4 hover:border-primary/40 transition-colors">
          <div className="relative shrink-0">
            <Bell className="w-5 h-5 text-primary" />
            {unreadAlerts > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center">
                {unreadAlerts > 9 ? "9+" : unreadAlerts}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Alerts</p>
            <p className="text-xs text-muted-foreground">
              {unreadAlerts > 0 ? `You have ${unreadAlerts} new alert${unreadAlerts === 1 ? "" : "s"}` : "No new alerts"}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
        </Link>

        {inTransit && (
          <div className="bg-white rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold flex items-center gap-1.5"><Truck className="w-4 h-4 text-primary" /> Trip in progress</h2>
              <Link to={`/customer/request/${inTransit.id}`} className="text-xs text-primary font-medium inline-flex items-center gap-1">
                Track <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{inTransit.cargo_type} · {inTransit.pickup_location} → {inTransit.destination}</p>

            <div className="flex items-start">
              {TRIP_STEPS.map((step, i) => {
                const done = i <= tripStepIndex;
                const StepIcon = step.icon;
                return (
                  <React.Fragment key={step.id}>
                    {i > 0 && <div className={cn("h-0.5 flex-1 mt-4", i <= tripStepIndex ? "bg-primary" : "bg-muted")} />}
                    <div className="flex flex-col items-center gap-1 w-14 shrink-0">
                      <span className={cn("w-8 h-8 rounded-full flex items-center justify-center", done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                        <StepIcon className="w-4 h-4" />
                      </span>
                      <span className={cn("text-[10px] text-center leading-tight", done ? "text-foreground font-medium" : "text-muted-foreground")}>{step.label}</span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {tripDriver && (
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                  {tripDriver.driver_photo_url ? (
                    <img src={tripDriver.driver_photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-5 h-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{tripDriver.driver_name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> {(tripDriver.driver_rating || 0).toFixed(1)} · {tripDriver.vehicle_type}
                  </p>
                </div>
                {tripPhone && (
                  <a href={`tel:${tripPhone}`} className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4 text-primary" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
