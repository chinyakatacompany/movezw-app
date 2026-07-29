import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Package, Users, DollarSign, TrendingUp } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { LoadingScreen } from "@/components/shared/Loaders";

const NAVY = "#1e2f5e";
const ORANGE = "#c2410c";
const EMERALD = "#059669";

function dayKey(d) { return d.toISOString().slice(0, 10); }
function shortLabel(key) { const [, m, day] = key.split("-"); return `${Number(day)}/${Number(m)}`; }

function buildSeries(days, jobs, users) {
  const completed = jobs.filter((j) => j.status === "completed");
  const shipmentByDay = {};
  const revenueByDay = {};
  jobs.forEach((j) => {
    const k = j.created_date ? dayKey(new Date(j.created_date)) : null;
    if (k) shipmentByDay[k] = (shipmentByDay[k] || 0) + 1;
  });
  completed.forEach((j) => {
    const k = j.updated_date ? dayKey(new Date(j.updated_date)) : null;
    if (k) revenueByDay[k] = (revenueByDay[k] || 0) + (j.accepted_price || 0);
  });
  const userTimes = users
    .map((u) => (u.created_date ? new Date(u.created_date).getTime() : 0))
    .sort((a, b) => a - b);
  return days.map((d) => {
    const k = dayKey(d);
    const end = d.getTime() + 86400000;
    return {
      date: shortLabel(k),
      shipments: shipmentByDay[k] || 0,
      revenue: Math.round(revenueByDay[k] || 0),
      users: userTimes.filter((t) => t <= end).length,
    };
  });
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 card-shadow animate-fade-in">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="h-[260px] w-full">{children}</div>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid hsl(var(--border))",
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
  fontSize: 12,
};

export default function AdminAnalytics() {
  const [series, setSeries] = useState(null);
  const [totals, setTotals] = useState({ shipments: 0, users: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [jobs, users] = await Promise.all([
          base44.entities.TransportRequest.filter({}, "-created_date", 500).catch(() => []),
          base44.entities.User.list().catch(() => []),
        ]);
        if (!active) return;
        const days = [];
        for (let i = 29; i >= 0; i--) {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          d.setDate(d.getDate() - i);
          days.push(d);
        }
        setSeries(buildSeries(days, jobs, users));
        const revenue = jobs
          .filter((j) => j.status === "completed")
          .reduce((sum, j) => sum + (j.accepted_price || 0), 0);
        setTotals({ shipments: jobs.length, users: users.length, revenue });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading || !series) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
        <PageHeader title="Analytics" subtitle="Growth trends across the platform" icon={TrendingUp} />
        <LoadingScreen label="Crunching the numbers…" />
      </div>
    );
  }

  const latest = series[series.length - 1];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader title="Analytics" subtitle="Growth trends across the platform (last 30 days)" icon={TrendingUp} />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard icon={Package} label="Total shipments" value={totals.shipments} tone="primary" sub={`${latest.shipments} today`} />
        <StatCard icon={Users} label="Registered users" value={totals.users} tone="accent" sub="cumulative" />
        <StatCard icon={DollarSign} label="Platform revenue" value={`$${totals.revenue.toLocaleString()}`} tone="emerald" sub="completed deliveries" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard title="Shipments over time" subtitle="Transport requests created per day">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gShip" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={NAVY} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={NAVY} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval={4} />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="shipments" stroke={NAVY} strokeWidth={2.5} fill="url(#gShip)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Active users" subtitle="Cumulative registered users">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval={4} />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="users" stroke={ORANGE} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Platform revenue over time" subtitle="Value of completed deliveries per day (USD)">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={EMERALD} stopOpacity={0.35} />
                <stop offset="100%" stopColor={EMERALD} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval={4} />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`$${Number(v).toLocaleString()}`, "Revenue"]} />
            <Area type="monotone" dataKey="revenue" stroke={EMERALD} strokeWidth={2.5} fill="url(#gRev)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
