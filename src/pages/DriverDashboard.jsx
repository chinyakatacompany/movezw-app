import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Package, Shield, AlertCircle, Truck, ChevronRight, Wifi, Briefcase, Route as RouteIcon, Target } from "lucide-react";
import RequestCard from "@/components/RequestCard";
import { EmptyState, formatMoney } from "@/lib/movezw";
import AvailabilityToggle from "@/components/AvailabilityToggle";
import NotificationSettings from "@/components/NotificationSettings";
import { AVAILABILITY_LABELS, distanceKm } from "@/lib/matching";
import { geolocationUnavailableReason } from "@/lib/geo";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

function timeOfDayGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

export default function DriverDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [openRequests, setOpenRequests] = useState(null);
  const [myJobs, setMyJobs] = useState(null);
  const [driverPos, setDriverPos] = useState(null);

  // Best-effort — lets each request card show "X km away". No map, no
  // dedicated loading/error UI: if location isn't available, cards simply
  // show without a distance rather than taking up space explaining why.
  useEffect(() => {
    if (geolocationUnavailableReason()) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setDriverPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
    );
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("driver_profiles")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) console.error("Failed to load driver profile:", error);
        setProfile(data?.[0] || null);
      });
    supabase
      .from("transport_requests")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (error) console.error("Failed to load open requests:", error);
        setOpenRequests(data || []);
      });
    supabase
      .from("transport_requests")
      .select("*")
      .eq("accepted_driver_id", user.id)
      .in("status", ["confirmed", "en_route_pickup", "collected", "in_transit", "delivered"])
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) console.error("Failed to load active jobs:", error);
        setMyJobs(data || []);
      });
  }, [user?.id]);

  // Keep "Nearby open requests" live: the moment another driver accepts a
  // request (or the customer cancels it), it disappears here without a
  // manual refresh — otherwise a driver could tap into a job someone else
  // already took.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`driver-dashboard-open-requests-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transport_requests", filter: "status=eq.open" }, (payload) => {
        setOpenRequests((cur) => (cur ? [payload.new, ...cur] : cur));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "transport_requests" }, (payload) => {
        setOpenRequests((cur) => {
          if (!cur) return cur;
          if (payload.new.status === "open") {
            const exists = cur.some((r) => r.id === payload.new.id);
            return exists ? cur.map((r) => (r.id === payload.new.id ? payload.new : r)) : [payload.new, ...cur];
          }
          return cur.filter((r) => r.id !== payload.new.id);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const [toggling, setToggling] = useState(false);
  const verified = profile?.verification_status === "approved";

  const updateAvailability = async (status) => {
    setToggling(true);
    try {
      const { data: updated, error } = await supabase
        .from("driver_profiles")
        .update({
          availability_status: status,
          last_available_at: status === "online" ? new Date().toISOString() : profile.last_available_at,
        })
        .eq("id", profile.id)
        .select()
        .single();
      if (error) throw error;
      setProfile({ ...profile, ...updated });
      toast({
        title: `You're ${AVAILABILITY_LABELS[status]}`,
        description:
          status === "online"
            ? "You'll receive matching job requests."
            : "You won't receive new job requests.",
      });
    } catch {
      toast({ title: "Could not update availability", variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  if (!profile) {
    return (
      <div className="p-4 space-y-4">
        <h1 className="text-2xl font-bold tracking-tight pt-2">Driver dashboard</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-amber-900">Complete your driver profile</h2>
          <p className="text-sm text-amber-700 mt-1 mb-4">Upload your documents to start receiving jobs.</p>
          <Link to="/driver/onboarding" className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
            Set up profile
          </Link>
        </div>
      </div>
    );
  }

  if (!verified) {
    const isRejected = profile.verification_status === "rejected";
    return (
      <div className="p-4 space-y-4">
        <div className="pt-2">
          <h1 className="text-2xl font-bold tracking-tight">{user?.full_name?.split(" ")[0] || "Driver"} 👋</h1>
          <p className="text-sm text-muted-foreground">{profile.vehicle_type} · {profile.location_area || "Zimbabwe"}</p>
        </div>
        <div className={`border rounded-2xl p-5 text-center ${isRejected ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
          <Shield className={`w-8 h-8 mx-auto mb-3 ${isRejected ? "text-red-500" : "text-amber-500"}`} />
          <h2 className="text-base font-semibold">{isRejected ? "Verification rejected" : "Verification in progress"}</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            {isRejected
              ? profile.verification_note || "Please review and re-upload your documents."
              : "Our admin team is reviewing your documents. You'll be able to receive jobs once approved."}
          </p>
          <Link to="/driver/onboarding" className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
            {isRejected ? "Update documents" : "View profile"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="relative -mx-4 -mt-4 mb-2 overflow-hidden bg-gradient-to-br from-header to-black/30 rounded-b-3xl px-4 pt-6 pb-8">
        <Truck className="absolute -right-3 -bottom-3 w-28 h-28 text-white/10 -rotate-6" />
        <svg className="absolute bottom-0 left-0 right-0 h-6 text-white/10" viewBox="0 0 400 24" preserveAspectRatio="none" fill="none">
          <path d="M0 20 Q100 4 200 16 T400 10" stroke="currentColor" strokeWidth="3" strokeDasharray="10 8" strokeLinecap="round" />
        </svg>
        <div className="relative">
          <p className="text-sm text-white/70">Good {timeOfDayGreeting()}</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">{user?.full_name?.split(" ")[0] || "Driver"} 👋</h1>
          <p className="text-sm text-white/70">{profile.vehicle_type} · {profile.location_area || "Zimbabwe"}</p>
          {myJobs?.length > 0 && (
            <Link
              to={`/driver/job/${myJobs[0].id}`}
              className="mt-3 flex items-center gap-2 bg-white/10 hover:bg-white/15 transition-colors rounded-xl px-3 py-2 w-fit"
            >
              <Package className="w-4 h-4 text-white" />
              <span className="text-sm font-medium text-white">{myJobs.length} active job{myJobs.length === 1 ? "" : "s"}</span>
              <ChevronRight className="w-4 h-4 text-white/70" />
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <a href="#availability-toggle" className="bg-white rounded-2xl border border-border p-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-2">
            <Wifi className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-sm font-semibold">Availability</p>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2.5">Set your availability to receive jobs</p>
          <span className={cn(
            "inline-block text-xs font-semibold px-2.5 py-1 rounded-full border",
            (profile.availability_status || "offline") === "online"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : profile.availability_status === "busy"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-muted text-muted-foreground border-border"
          )}>
            {AVAILABILITY_LABELS[profile.availability_status] || "Offline"}
          </span>
        </a>

        <Link to="/return-loads" className="bg-white rounded-2xl border border-border p-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-2">
            <Briefcase className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-sm font-semibold">Loads</p>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2.5">View and manage available loads for you</p>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>

        <Link to="/driver/history" className="bg-white rounded-2xl border border-border p-4">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-2">
            <RouteIcon className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-sm font-semibold">Trips</p>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2.5">Track your ongoing and past trips</p>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>

        <a href="#nearby-requests" className="bg-white rounded-2xl border border-border p-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm font-semibold">Nearby Requests</p>
          <p className="text-lg font-bold mt-0.5">{openRequests?.length ?? "—"}</p>
          <p className="text-[11px] text-muted-foreground mb-2.5">Matching jobs near you</p>
          <span className="text-xs font-semibold text-primary">View all</span>
        </a>
      </div>

      <div id="availability-toggle" className="bg-card rounded-2xl border border-border p-4 card-shadow animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold">Availability</p>
            <p className="text-xs text-muted-foreground">Go online to receive matching jobs</p>
          </div>
          <span className={cn(
            "text-xs font-semibold px-2.5 py-1 rounded-full border",
            (profile.availability_status || "offline") === "online"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : profile.availability_status === "busy"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-muted text-muted-foreground border-border"
          )}>
            {AVAILABILITY_LABELS[profile.availability_status] || "Offline"}
          </span>
        </div>
        <AvailabilityToggle value={profile.availability_status} onChange={updateAvailability} disabled={toggling} />
      </div>

      <NotificationSettings description="Get notified the moment a matching job comes in, even with the app in the background." />

      {myJobs?.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">{myJobs.length === 1 ? "Current job" : "Active jobs"}</h2>
          <div className="space-y-3">
            {myJobs.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                to={`/driver/job/${r.id}`}
                showCustomer
                distanceKm={driverPos ? distanceKm(driverPos.lat, driverPos.lng, r.pickup_lat, r.pickup_lng) : null}
              />
            ))}
          </div>
        </div>
      )}

      <div id="nearby-requests">
        <h2 className="text-base font-semibold mb-3">Nearby open requests</h2>
        {openRequests === null ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}
          </div>
        ) : openRequests.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border">
            <EmptyState icon={Package} title="No open requests" subtitle="New transport requests from customers will appear here." />
          </div>
        ) : (
          <div className="space-y-3">
            {openRequests.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                to={`/driver/job/${r.id}`}
                showCustomer
                distanceKm={driverPos ? distanceKm(driverPos.lat, driverPos.lng, r.pickup_lat, r.pickup_lng) : null}
                tripDistanceKm={distanceKm(r.pickup_lat, r.pickup_lng, r.destination_lat, r.destination_lng)}
                rightSlot={<span className="text-sm font-bold text-primary">{formatMoney(r.budget)}</span>}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
