import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Plus, Package, CheckCircle2, Truck, ArrowRight } from "lucide-react";
import RequestCard from "@/components/RequestCard";
import { EmptyState, STATUS_FLOW, STATUS_LABELS } from "@/lib/movezw";
import { cn } from "@/lib/utils";
import NotificationSettings from "@/components/NotificationSettings";

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [requests, setRequests] = useState(null);
  const [stats, setStats] = useState({ active: 0, completed: 0 });

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
        setStats({
          active: data.filter((x) => !["completed", "cancelled"].includes(x.status)).length,
          completed: data.filter((x) => x.status === "completed").length,
        });
      });
  }, [user?.id]);

  const active = (requests || []).filter((x) => !["completed", "cancelled"].includes(x.status));
  const inTransit = active.find((x) => STATUS_FLOW.includes(x.status));
  const transitStep = inTransit ? STATUS_FLOW.indexOf(inTransit.status) : -1;

  return (
    <div className="p-4 space-y-6">
      <div className="pt-2">
        <p className="text-sm text-muted-foreground">Welcome back</p>
        <h1 className="text-2xl font-bold tracking-tight">{user?.full_name?.split(" ")[0] || "there"} 👋</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-primary to-accent rounded-2xl p-4 text-white">
          <p className="text-xs font-medium text-white/80">Active deliveries</p>
          <p className="text-3xl font-bold mt-1">{stats.active}</p>
          <div className="flex items-center gap-1 mt-2 text-xs text-white/80">
            <Truck className="w-3.5 h-3.5" /> In progress
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-xs font-medium text-muted-foreground">Completed</p>
          <p className="text-3xl font-bold mt-1">{stats.completed}</p>
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Delivered
          </div>
        </div>
      </div>

      <Link to="/customer/new" className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-primary-foreground font-semibold shadow-sm hover:bg-primary/90 transition-colors">
        <Plus className="w-5 h-5" />
        New transport request
      </Link>

      <NotificationSettings description="Get notified the moment a driver quotes your request, even with the app in the background." />

      {inTransit && (
        <Link to={`/customer/request/${inTransit.id}`} className="block bg-white rounded-2xl border border-border p-4 hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold flex items-center gap-1.5"><Truck className="w-4 h-4 text-primary" /> Trip progress</h2>
            <span className="text-xs text-primary font-medium inline-flex items-center gap-1">Track <ArrowRight className="w-3 h-3" /></span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{inTransit.cargo_type} · {inTransit.pickup_location} → {inTransit.destination}</p>
          <div className="flex gap-1 mb-2">
            {STATUS_FLOW.map((step, i) => (
              <span key={step} className={cn("h-1.5 flex-1 rounded-full", i <= transitStep ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
          <p className="text-xs font-medium text-foreground">{STATUS_LABELS[inTransit.status]}</p>
        </Link>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Active deliveries</h2>
          {active.length > 0 && (
            <Link to="/customer/history" className="text-xs text-primary font-medium inline-flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
        {requests === null ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}
          </div>
        ) : active.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border">
            <EmptyState icon={Package} title="No active deliveries" subtitle="Create a transport request to get quotes from drivers near you." />
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((r) => (
              <RequestCard key={r.id} request={r} to={`/customer/request/${r.id}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}