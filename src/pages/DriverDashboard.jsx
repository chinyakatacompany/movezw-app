import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Package, Shield, Loader2, Star, TrendingUp, AlertCircle } from "lucide-react";
import RequestCard from "@/components/RequestCard";
const ShipmentMap = React.lazy(() => import("@/components/ShipmentMap"));
import { EmptyState, formatMoney, StarRating, STATUS_LABELS, shipmentPosition, STATUS_COLORS } from "@/lib/movezw";
import AvailabilityToggle from "@/components/AvailabilityToggle";
import NotificationSettings from "@/components/NotificationSettings";
import { AVAILABILITY_LABELS } from "@/lib/matching";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export default function DriverDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [openRequests, setOpenRequests] = useState(null);
  const [myJobs, setMyJobs] = useState(null);

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
      <div className="pt-2">
        <p className="text-sm text-muted-foreground">Welcome back</p>
        <h1 className="text-2xl font-bold tracking-tight">{user?.full_name?.split(" ")[0] || "Driver"} 👋</h1>
        <p className="text-sm text-muted-foreground">{profile.vehicle_type} · {profile.location_area || "Zimbabwe"}</p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-4 card-shadow animate-fade-in">
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

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-border p-3 text-center">
          <StarRating value={profile.rating_avg || 0} />
          <p className="text-lg font-bold mt-1">{profile.rating_avg?.toFixed(1) || "0.0"}</p>
          <p className="text-[10px] text-muted-foreground">Rating</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-3 text-center">
          <Package className="w-5 h-5 text-primary mx-auto mb-1" />
          <p className="text-lg font-bold">{profile.completed_jobs || 0}</p>
          <p className="text-[10px] text-muted-foreground">Jobs done</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-3 text-center">
          <TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
          <p className="text-lg font-bold">{myJobs?.length || 0}</p>
          <p className="text-[10px] text-muted-foreground">Active</p>
        </div>
      </div>

      {myJobs?.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Your active jobs</h2>
          <div className="space-y-3">
            {myJobs.map((r) => (
              <RequestCard key={r.id} request={r} to={`/driver/job/${r.id}`} showCustomer />
            ))}
          </div>
        </div>
      )}

      {myJobs?.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-4 card-shadow">
          <h2 className="text-base font-semibold mb-1">Active shipments map</h2>
          <p className="text-xs text-muted-foreground mb-3">Destinations for your active deliveries across Zimbabwe.</p>
          <React.Suspense fallback={<div className="h-[280px] rounded-xl bg-muted animate-pulse" />}>
            <ShipmentMap
              shipments={myJobs.map((r) => ({
                id: r.id,
                position: shipmentPosition(null, r),
                label: `${r.customer_name || "Customer"} · ${STATUS_LABELS[r.status] || r.status}`,
                color: STATUS_COLORS[r.status] || "#1e2f5e",
              }))}
            />
          </React.Suspense>
        </div>
      )}

      <div>
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
              <RequestCard key={r.id} request={r} to={`/driver/job/${r.id}`} showCustomer rightSlot={<span className="text-sm font-bold text-primary">{formatMoney(r.budget)}</span>} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
