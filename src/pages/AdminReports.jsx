import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Users, Package, BadgeCheck, CheckCircle2, Star } from "lucide-react";
import { formatDate } from "@/lib/movezw";

function MiniStat({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-2xl border border-border p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default function AdminReports() {
  const [data, setData] = useState({
    users: 0, drivers: 0, approvedDrivers: 0, jobs: 0, completed: 0, totalValue: 0, avgRating: 0,
  });

  useEffect(() => {
    (async () => {
      const [users, profiles, jobs] = await Promise.all([
        base44.entities.User.list().catch(() => []),
        base44.entities.DriverProfile.list().catch(() => []),
        base44.entities.TransportRequest.filter({}, "-created_date", 200).catch(() => []),
      ]);
      const completed = jobs.filter((j) => j.status === "completed");
      const totalValue = completed.reduce((s, j) => s + (j.accepted_price || 0), 0);
      const rated = profiles.filter((p) => p.rating_count > 0);
      const avgRating = rated.length ? rated.reduce((s, p) => s + (p.rating_avg || 0), 0) / rated.length : 0;
      setData({
        users: users.length,
        drivers: profiles.length,
        approvedDrivers: profiles.filter((p) => p.verification_status === "approved").length,
        jobs: jobs.length,
        completed: completed.length,
        totalValue,
        avgRating: avgRating.toFixed(1),
      });
    })();
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Platform performance summary</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStat icon={Users} label="Total users" value={data.users} color="bg-blue-50 text-blue-600" />
        <MiniStat icon={BadgeCheck} label="Approved drivers" value={data.approvedDrivers} color="bg-emerald-50 text-emerald-600" />
        <MiniStat icon={Package} label="Total jobs" value={data.jobs} color="bg-indigo-50 text-indigo-600" />
        <MiniStat icon={CheckCircle2} label="Completed" value={data.completed} color="bg-emerald-50 text-emerald-600" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-primary to-accent rounded-2xl p-6 text-white">
          <p className="text-sm text-white/80">Total delivered value</p>
          <p className="text-4xl font-bold mt-1">${data.totalValue.toLocaleString()}</p>
          <p className="text-xs text-white/70 mt-2">Sum of accepted prices across completed deliveries</p>
        </div>
        <div className="bg-white rounded-2xl border border-border p-6">
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
            <p className="text-sm text-muted-foreground">Average driver rating</p>
          </div>
          <p className="text-4xl font-bold mt-1">{data.avgRating || "0.0"}</p>
          <p className="text-xs text-muted-foreground mt-2">Across all rated drivers</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border p-6">
        <h2 className="text-base font-semibold mb-1">Payment integration (future-ready)</h2>
        <p className="text-sm text-muted-foreground">
          Delivery records include <code className="text-xs bg-muted px-1.5 py-0.5 rounded">payment_status</code> and <code className="text-xs bg-muted px-1.5 py-0.5 rounded">payment_method</code> fields
          ready for EcoCash, Stripe, or other gateway integration.
        </p>
      </div>
    </div>
  );
}
