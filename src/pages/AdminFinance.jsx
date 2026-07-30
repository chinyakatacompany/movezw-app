import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import {
  Wallet, TrendingUp, Lock, RotateCcw, FileText, Settings as SettingsIcon,
  Download, Loader2, DollarSign, Receipt,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { formatMoney, formatDate } from "@/lib/movezw";
import { getCommissionConfig } from "@/lib/payments";
import { downloadCSV, downloadExcel, downloadPDF } from "@/lib/financeReports";
import RefundQueue from "@/components/finance/RefundQueue";
import CommissionSettings from "@/components/finance/CommissionSettings";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

const NAVY = "#1e2f5e";
const ORANGE = "#c2410c";

const TABS = [
  { id: "overview", label: "Overview", icon: TrendingUp },
  { id: "refunds", label: "Refunds", icon: RotateCcw },
  { id: "audit", label: "Audit trail", icon: FileText },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

const AUDIT_TONE = {
  commission_charged: "bg-amber-50 text-amber-600",
  commission_refunded: "bg-emerald-50 text-emerald-600",
  refund_approved: "bg-emerald-50 text-emerald-600",
  refund_rejected: "bg-rose-50 text-rose-600",
  refund_requested: "bg-blue-50 text-blue-600",
  refund_claimed: "bg-emerald-50 text-emerald-600",
  job_completed: "bg-emerald-50 text-emerald-600",
  wallet_topup: "bg-blue-50 text-blue-600",
  payout_requested: "bg-amber-50 text-amber-600",
  commission_rate_update: "bg-primary/10 text-primary",
  commission_settings_update: "bg-primary/10 text-primary",
};

function shortId(id) {
  return id ? String(id).slice(-6).toUpperCase() : "";
}

function buildLedger(jobs, refunds, rate) {
  const rows = [];
  jobs.forEach((j) => {
    const price = j.accepted_price || 0;
    if (!price) return;
    const comm = Math.round(price * rate * 100) / 100;
    const date = formatDate(j.updated_at || j.created_at);
    const desc = `${j.cargo_type}: ${j.pickup_location} → ${j.destination}`;
    if (j.status === "completed") rows.push([date, "Commission", shortId(j.id), desc, comm, "Realised"]);
    else if (["collected", "in_transit", "delivered"].includes(j.status)) rows.push([date, "Escrow hold", shortId(j.id), desc, comm, "Pending"]);
  });
  refunds.forEach((r) => {
    if (["paid", "approved"].includes(r.status)) {
      rows.push([formatDate(r.requested_at), "Refund", shortId(r.id), r.reason, -(r.amount || 0), r.status === "paid" ? "Refunded" : "Approved"]);
    }
  });
  return rows.sort((a, b) => (b[0] < a[0] ? -1 : 1));
}

export default function AdminFinance() {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  const [jobs, setJobs] = useState(null);
  const [refunds, setRefunds] = useState(null);
  const [audits, setAudits] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [{ data: allJobs }, { data: allRefunds }, { data: allAudits }, config] = await Promise.all([
        supabase.from("transport_requests").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("refund_requests").select("*").order("requested_at", { ascending: false }).limit(200),
        supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200),
        getCommissionConfig(),
      ]);
      setJobs(allJobs || []);
      setRefunds(allRefunds || []);
      setAudits(allAudits || []);
      setCfg(config);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    /* eslint-disable-next-line */
  }, []);

  const rate = cfg?.rate ?? 0.1;

  const metrics = useMemo(() => {
    const list = jobs || [];
    const completed = list.filter((j) => j.status === "completed");
    const escrow = list.filter((j) => ["collected", "in_transit", "delivered"].includes(j.status));
    const gross = completed.reduce((s, j) => s + (j.accepted_price || 0), 0);
    const realised = completed.reduce((s, j) => s + (j.accepted_price || 0) * rate, 0);
    const pendingEscrow = escrow.reduce((s, j) => s + (j.accepted_price || 0) * rate, 0);
    const rf = refunds || [];
    const refundsPaid = rf.filter((r) => ["paid", "approved"].includes(r.status)).reduce((s, r) => s + (r.amount || 0), 0);
    const net = realised - refundsPaid;
    return { gross, realised, pendingEscrow, refundsPaid, net, completedCount: completed.length, pendingRefunds: rf.filter((r) => r.status === "pending").length };
  }, [jobs, refunds, rate]);

  const commissionSeries = useMemo(() => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    const byDay = {};
    (jobs || []).filter((j) => j.status === "completed").forEach((j) => {
      const k = j.updated_at ? new Date(j.updated_at).toISOString().slice(0, 10) : null;
      if (k) byDay[k] = (byDay[k] || 0) + (j.accepted_price || 0) * rate;
    });
    return days.map((d) => {
      const k = d.toISOString().slice(0, 10);
      const [, m, day] = k.split("-");
      return { date: `${Number(day)}/${Number(m)}`, commission: Math.round((byDay[k] || 0) * 100) / 100 };
    });
  }, [jobs, rate]);

  const ledger = useMemo(() => buildLedger(jobs || [], refunds || [], rate), [jobs, refunds, rate]);
  const ledgerCols = ["Date", "Type", "Reference", "Description", "Amount (USD)", "Status"];

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
        <PageHeader title="Financial management" subtitle="Platform wallet, commission & refunds" icon={Wallet} />
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader title="Financial management" subtitle="Platform wallet, commission, refunds & reports" icon={Wallet} />

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
              tab === t.id ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground hover:bg-muted"
            )}
          >
            <t.icon className="w-4 h-4" /> {t.label}
            {t.id === "refunds" && metrics.pendingRefunds > 0 && (
              <span className="ml-1 bg-accent text-accent-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">{metrics.pendingRefunds}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard icon={DollarSign} label="Net platform revenue" value={formatMoney(metrics.net)} sub="realised − refunds" tone="emerald" />
            <StatCard icon={TrendingUp} label="Commission realised" value={formatMoney(metrics.realised)} sub={`${metrics.completedCount} completed`} tone="primary" />
            <StatCard icon={Lock} label="Pending escrow" value={formatMoney(metrics.pendingEscrow)} sub="held on active jobs" tone="amber" />
            <StatCard icon={RotateCcw} label="Refunds paid" value={formatMoney(metrics.refundsPaid)} sub="approved / claimed" tone="accent" />
          </div>

          <div className="bg-card rounded-2xl border border-border p-5 card-shadow">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Commission over time</h2>
                <p className="text-xs text-muted-foreground">Realised platform commission per day (last 30 days)</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => downloadCSV("movezw-finance.csv", ledgerCols, ledger)} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 h-8 rounded-lg border border-border hover:bg-muted">
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
                <button onClick={() => downloadExcel("movezw-finance.xls", ledgerCols, ledger)} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 h-8 rounded-lg border border-border hover:bg-muted">
                  <Download className="w-3.5 h-3.5" /> Excel
                </button>
                <button onClick={() => downloadPDF("movezw-finance.pdf", "MoveZW Financial Report", ledgerCols, ledger)} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 h-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
              </div>
            </div>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={commissionSeries} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gComm" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ORANGE} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={ORANGE} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval={4} />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }} formatter={(v) => [`$${Number(v).toLocaleString()}`, "Commission"]} />
                  <Area type="monotone" dataKey="commission" stroke={ORANGE} strokeWidth={2.5} fill="url(#gComm)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border p-5 card-shadow">
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2"><Receipt className="w-4 h-4 text-primary" /> Financial ledger</h2>
            {ledger.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No financial activity yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      {ledgerCols.map((c) => <th key={c} className="py-2 pr-4 font-medium">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.slice(0, 20).map((r, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        {r.map((c, j) => (
                          <td key={j} className={cn("py-2 pr-4", j === 4 && "font-semibold", j === 5 && "text-xs")}>
                            {j === 4 ? formatMoney(Math.abs(c)) + (Number(c) < 0 ? " −" : "") : c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ledger.length > 20 && <p className="text-xs text-muted-foreground mt-3">Showing 20 of {ledger.length} — download for the full report.</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "refunds" && <RefundQueue refunds={refunds || []} adminId={user?.id} onChanged={load} />}

      {tab === "audit" && (
        <div className="bg-card rounded-2xl border border-border p-5 card-shadow">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Audit trail</h2>
          {(!audits || audits.length === 0) ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No audit events yet.</p>
          ) : (
            <div className="space-y-2">
              {audits.map((a) => (
                <div key={a.id} className="flex items-start gap-3 py-2 border-b border-border/60 last:border-0">
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5", AUDIT_TONE[a.action] || "bg-muted text-muted-foreground")}>
                    {a.action.replace(/_/g, " ")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{a.details}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDate(a.created_at)} · {a.actor_name || "System"}{a.reference ? ` · Ref ${a.reference}` : ""}{a.amount ? ` · ${formatMoney(a.amount)}` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "settings" && <CommissionSettings cfg={cfg} adminId={user?.id} />}
    </div>
  );
}
