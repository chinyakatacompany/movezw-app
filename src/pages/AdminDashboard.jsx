import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Users, BadgeCheck, Package, CheckCircle2, Clock, ArrowRight, TrendingUp, Wallet, Truck } from "lucide-react";
import { formatMoney, formatDate, StatusBadge } from "@/lib/movezw";
import { ADMIN_ACTIVE_STATUSES, advanceAdminJob } from "@/lib/adminJobs";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { SkeletonCard } from "@/components/shared/Loaders";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import AdminJobTracker from "@/components/admin/AdminJobTracker";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ users: 0, pendingDrivers: 0, pendingTopups: 0, activeJobs: 0, inTransit: 0, completed: 0 });
  const [activeJobRows, setActiveJobRows] = useState(null);
  const [trackedJobId, setTrackedJobId] = useState(null);
  const [recentJobs, setRecentJobs] = useState(null);
  const [pending, setPending] = useState(null);
  const [pendingTopupRows, setPendingTopupRows] = useState(null);
  const [topupDriverNames, setTopupDriverNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState(null);

  const load = useCallback(async () => {
    try {
      const [{ count: userCount }, pendTop, pendAll, recent, activeJobs, inTransitJobs, returnActive, returnInTransit, done, returnDone, pendTopups, pendTopupsAll] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("driver_profiles").select("*").eq("verification_status", "pending").order("created_at", { ascending: false }).limit(5),
        supabase.from("driver_profiles").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
        supabase.from("transport_requests").select("*").order("created_at", { ascending: false }).limit(8),
        supabase.from("transport_requests").select("*", { count: "exact" }).in("status", ADMIN_ACTIVE_STATUSES).order("created_at", { ascending: false }).limit(5),
        supabase.from("transport_requests").select("id", { count: "exact", head: true }).eq("status", "in_transit"),
        supabase.from("return_load_deliveries").select("id", { count: "exact", head: true }).in("status", ADMIN_ACTIVE_STATUSES),
        supabase.from("return_load_deliveries").select("id", { count: "exact", head: true }).eq("status", "in_transit"),
        supabase.from("transport_requests").select("id", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("return_load_deliveries").select("id", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("transactions").select("*").eq("type", "topup").eq("status", "pending").order("created_at", { ascending: false }).limit(5),
        supabase.from("transactions").select("id", { count: "exact", head: true }).eq("type", "topup").eq("status", "pending"),
      ]);
      setStats({
        users: userCount || 0,
        pendingDrivers: pendAll.count || 0,
        pendingTopups: pendTopupsAll.count || 0,
        activeJobs: (activeJobs.count || 0) + (returnActive.count || 0),
        inTransit: (inTransitJobs.count || 0) + (returnInTransit.count || 0),
        completed: (done.count || 0) + (returnDone.count || 0),
      });
      const liveJobs = activeJobs.data || [];
      setActiveJobRows(liveJobs);
      setTrackedJobId((current) => liveJobs.some((job) => job.id === current) ? current : liveJobs[0]?.id || null);
      setPending(pendTop.data || []);
      setRecentJobs(recent.data || []);
      setPendingTopupRows(pendTopups.data || []);
      const driverIds = [...new Set((pendTopups.data || []).map((t) => t.user_id))];
      if (driverIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", driverIds);
        setTopupDriverNames(Object.fromEntries((profs || []).map((p) => [p.id, p.full_name])));
      } else {
        setTopupDriverNames({});
      }
    } catch {
      setActiveJobRows([]);
      setPending([]);
      setRecentJobs([]);
      setPendingTopupRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("admin-dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_profiles" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "transport_requests" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "return_load_deliveries" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, load)
      .subscribe();
    const refreshVisible = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const advanceJob = async (job, nextStatus) => {
    if (statusBusy) return;
    setStatusBusy(true);
    try {
      await advanceAdminJob(job, nextStatus, user.id);
      toast({ title: `Job marked as ${nextStatus.replaceAll("_", " ")}` });
      setStatusConfirm(null);
      await load();
    } catch (error) {
      toast({ title: "Status update failed", description: error.message, variant: "destructive" });
    } finally {
      setStatusBusy(false);
    }
  };

  const trackedJob = activeJobRows?.find((job) => job.id === trackedJobId) || null;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader title="Dashboard" subtitle="MoveZW marketplace overview" icon={TrendingUp} />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
        <StatCard icon={Users} label="Registered users" value={stats.users} tone="primary" loading={loading} />
        <StatCard icon={BadgeCheck} label="Pending verifications" value={stats.pendingDrivers} tone="amber" loading={loading} />
        <StatCard icon={Wallet} label="Pending top-ups" value={stats.pendingTopups} tone="amber" loading={loading} />
        <StatCard icon={Package} label="Active jobs" value={stats.activeJobs} tone="accent" loading={loading} />
        <StatCard icon={Truck} label="In transit" value={stats.inTransit} tone="amber" loading={loading} />
        <StatCard icon={CheckCircle2} label="Completed deliveries" value={stats.completed} tone="emerald" loading={loading} />
      </div>

      <div className="bg-card rounded-2xl border border-border p-4 sm:p-5 card-shadow animate-fade-in">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold">Live active-job tracking</h2>
            <p className="text-xs text-muted-foreground">Routes, driver location and delivery progress update automatically.</p>
          </div>
          <Link to="/admin/jobs" className="text-xs text-accent font-semibold inline-flex items-center gap-1 shrink-0">
            All jobs <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {!activeJobRows ? (
          <SkeletonCard lines={4} />
        ) : activeJobRows.length === 0 ? (
          <div className="rounded-xl bg-muted/50 py-8 text-center text-sm text-muted-foreground">No active jobs to track.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {activeJobRows.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setTrackedJobId(job.id)}
                  className={`min-w-48 rounded-xl border p-3 text-left transition-colors ${trackedJobId === job.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                >
                  <p className="text-sm font-semibold truncate">{job.cargo_type || "Delivery"}</p>
                  <p className="text-xs text-muted-foreground truncate mt-1">{job.pickup_location} → {job.destination}</p>
                  <div className="mt-2"><StatusBadge status={job.status} /></div>
                </button>
              ))}
            </div>
            {trackedJob && (
              <AdminJobTracker
                job={trackedJob}
                busy={statusBusy}
                onAdvance={(job, nextStatus) => {
                  if (nextStatus === "completed") setStatusConfirm({ job, nextStatus });
                  else void advanceJob(job, nextStatus);
                }}
              />
            )}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Pending verifications */}
          <div className="bg-card rounded-2xl border border-border p-5 card-shadow animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Driver verifications</h2>
              <Link to="/admin/verification" className="text-xs text-accent font-semibold inline-flex items-center gap-1 hover:gap-1.5 transition-all">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {!pending ? (
              <SkeletonCard lines={3} />
            ) : pending.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No pending verifications.</div>
            ) : (
              <div className="space-y-2">
                {pending.map((d) => (
                  <Link key={d.id} to="/admin/verification" className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted transition-colors">
                    <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.full_name}</p>
                      <p className="text-xs text-muted-foreground">{d.vehicle_type}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Pending commission top-up approvals */}
          <div className="bg-card rounded-2xl border border-border p-5 card-shadow animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Top-up approvals</h2>
              <Link to="/admin/finance" className="text-xs text-accent font-semibold inline-flex items-center gap-1 hover:gap-1.5 transition-all">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {!pendingTopupRows ? (
              <SkeletonCard lines={3} />
            ) : pendingTopupRows.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No top-ups awaiting approval.</div>
            ) : (
              <div className="space-y-2">
                {pendingTopupRows.map((t) => (
                  <Link key={t.id} to="/admin/finance" className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted transition-colors">
                    <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                      <Wallet className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{topupDriverNames[t.user_id] || "Driver"}</p>
                      <p className="text-xs text-muted-foreground">{formatMoney(t.amount)} · {t.method}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent jobs */}
        <div className="bg-card rounded-2xl border border-border p-5 card-shadow animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Recent jobs</h2>
            <Link to="/admin/jobs" className="text-xs text-accent font-semibold inline-flex items-center gap-1 hover:gap-1.5 transition-all">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {!recentJobs ? (
            <SkeletonCard lines={4} />
          ) : recentJobs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No jobs yet.</div>
          ) : (
            <div className="space-y-2">
              {recentJobs.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-1.5">
                  <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.cargo_type} · {r.pickup_location} → {r.destination}</p>
                    <p className="text-xs text-muted-foreground">{r.customer_name || "Customer"} · {formatDate(r.created_at)}</p>
                  </div>
                  <StatusBadge status={r.status} />
                  <span className="text-sm font-semibold text-primary hidden sm:inline whitespace-nowrap">{formatMoney(r.accepted_price || r.budget)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={!!statusConfirm}
        onClose={() => !statusBusy && setStatusConfirm(null)}
        onConfirm={() => statusConfirm && advanceJob(statusConfirm.job, statusConfirm.nextStatus)}
        title="Complete this delivery?"
        description="Confirm that the cargo has been handed over. The job will be completed and the driver's earnings will be processed."
        confirmText="Complete delivery"
      />
    </div>
  );
}
