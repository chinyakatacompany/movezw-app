import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Users, BadgeCheck, Package, CheckCircle2, Clock, ArrowRight, TrendingUp } from "lucide-react";
import { formatMoney, formatDate, StatusBadge } from "@/lib/movezw";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { SkeletonCard } from "@/components/shared/Loaders";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ users: 0, pendingDrivers: 0, activeJobs: 0, completed: 0 });
  const [recentJobs, setRecentJobs] = useState(null);
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [users, pendTop, pendAll, recent, activeJobs, done] = await Promise.all([
          base44.entities.User.list(),
          base44.entities.DriverProfile.filter({ verification_status: "pending" }, "-created_date", 5),
          base44.entities.DriverProfile.filter({ verification_status: "pending" }),
          base44.entities.TransportRequest.filter({}, "-created_date", 8),
          base44.entities.TransportRequest.filter({ status: { $in: ["confirmed", "en_route_pickup", "collected", "in_transit", "delivered"] } }),
          base44.entities.TransportRequest.filter({ status: "completed" }),
        ]);
        if (!active) return;
        setStats({
          users: users.length,
          pendingDrivers: pendAll.length,
          activeJobs: activeJobs.length,
          completed: done.length,
        });
        setPending(pendTop);
        setRecentJobs(recent);
      } catch {
        setPending([]);
        setRecentJobs([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader title="Dashboard" subtitle="MoveZW marketplace overview" icon={TrendingUp} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={Users} label="Registered users" value={stats.users} tone="primary" loading={loading} />
        <StatCard icon={BadgeCheck} label="Pending verifications" value={stats.pendingDrivers} tone="amber" loading={loading} />
        <StatCard icon={Package} label="Active jobs" value={stats.activeJobs} tone="accent" loading={loading} />
        <StatCard icon={CheckCircle2} label="Completed deliveries" value={stats.completed} tone="emerald" loading={loading} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
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
                    <p className="text-xs text-muted-foreground">{r.customer_name || "Customer"} · {formatDate(r.created_date)}</p>
                  </div>
                  <StatusBadge status={r.status} />
                  <span className="text-sm font-semibold text-primary hidden sm:inline whitespace-nowrap">{formatMoney(r.accepted_price || r.budget)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
