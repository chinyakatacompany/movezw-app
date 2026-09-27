import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CircleHelp,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const SEVERITIES = {
  critical: {
    label: "Critical",
    icon: AlertCircle,
    card: "border-red-200",
    badge: "bg-red-50 text-red-700 border-red-200",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    card: "border-amber-200",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
  },
  info: {
    label: "Attention",
    icon: CircleHelp,
    card: "border-blue-200",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
  },
};

const CATEGORY_LABELS = {
  accounts: "Accounts",
  drivers: "Drivers",
  jobs: "Jobs",
  finance: "Finance",
  notifications: "Notifications",
};

const ACTION_DESCRIPTIONS = {
  confirm_email: "This immediately bypasses email verification. Confirm that the address belongs to the driver before continuing.",
  repair_profile: "This creates the missing MoveZW profile from the authenticated account metadata. It does not change the user's password.",
  fix_driver_role: "This changes the account role to Driver so its existing driver profile and dashboard work correctly.",
  unapprove_driver: "This immediately prevents the driver from accepting new jobs and returns verification to Pending. Existing deliveries remain active.",
};

export default function AdminIssues() {
  const [issues, setIssues] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [repairTarget, setRepairTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("admin-issues", {
      body: { action: "list" },
    });
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || "Could not scan for issues.");
      setIssues([]);
      return;
    }
    setIssues(data?.issues || []);
    setGeneratedAt(data?.generatedAt || new Date().toISOString());
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    all: issues?.length || 0,
    critical: (issues || []).filter((issue) => issue.severity === "critical").length,
    warning: (issues || []).filter((issue) => issue.severity === "warning").length,
    info: (issues || []).filter((issue) => issue.severity === "info").length,
  }), [issues]);

  const visibleIssues = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (issues || []).filter((issue) => {
      if (filter !== "all" && issue.severity !== filter && issue.category !== filter) return false;
      if (!needle) return true;
      return [issue.title, issue.description, issue.subject, issue.category]
        .some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [filter, issues, query]);

  const runRepair = async (issue) => {
    setBusyId(issue.id);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("admin-issues", {
        body: { action: issue.action, targetId: issue.targetId },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Issue resolved", description: `${issue.title} was repaired successfully.` });
      await load();
    } catch (repairError) {
      toast({ title: "Repair failed", description: repairError.message, variant: "destructive" });
    } finally {
      setBusyId(null);
      setRepairTarget(null);
    }
  };

  const filters = [
    ["all", `All (${counts.all})`],
    ["critical", `Critical (${counts.critical})`],
    ["warning", `Warnings (${counts.warning})`],
    ["info", `Attention (${counts.info})`],
    ...Object.entries(CATEGORY_LABELS).map(([key, label]) => [key, label]),
  ];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto pb-16">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wrench className="w-6 h-6 text-primary" /> Issues
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Detect account, driver, job, finance and notification problems that need administrator attention.
          </p>
          {generatedAt && (
            <p className="text-xs text-muted-foreground mt-1">Last scan: {new Date(generatedAt).toLocaleString("en-GB")}</p>
          )}
        </div>
        <Button variant="outline" onClick={load} disabled={issues === null}>
          {issues === null ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Scan again
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <button onClick={() => setFilter("critical")} className="rounded-2xl border border-red-200 bg-red-50 p-4 text-left">
          <p className="text-2xl font-bold text-red-700">{counts.critical}</p>
          <p className="text-xs font-semibold text-red-700">Critical</p>
        </button>
        <button onClick={() => setFilter("warning")} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left">
          <p className="text-2xl font-bold text-amber-700">{counts.warning}</p>
          <p className="text-xs font-semibold text-amber-700">Warnings</p>
        </button>
        <button onClick={() => setFilter("info")} className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left">
          <p className="text-2xl font-bold text-blue-700">{counts.info}</p>
          <p className="text-xs font-semibold text-blue-700">Attention</p>
        </button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
        {filters.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
              filter === key ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search issue, person or category..."
          className="w-full h-10 pl-10 pr-3 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {error && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Issue scan failed</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {issues === null ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-7 h-7 text-primary animate-spin" /></div>
      ) : visibleIssues.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 py-14 px-5 text-center">
          <ShieldCheck className="w-11 h-11 text-emerald-600 mx-auto mb-3" />
          <p className="font-semibold text-emerald-800">No matching issues</p>
          <p className="text-sm text-emerald-700 mt-1">The current scan found nothing requiring action in this view.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleIssues.map((issue) => {
            const severity = SEVERITIES[issue.severity] || SEVERITIES.info;
            const SeverityIcon = severity.icon;
            return (
              <div key={issue.id} className={cn("rounded-2xl border bg-card p-4", severity.card)}>
                <div className="flex items-start gap-3">
                  <div className={cn("w-9 h-9 rounded-xl border flex items-center justify-center shrink-0", severity.badge)}>
                    <SeverityIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold">{issue.title}</h2>
                      <span className={cn("text-[10px] uppercase font-bold border rounded-full px-2 py-0.5", severity.badge)}>{severity.label}</span>
                      <span className="text-[10px] uppercase font-bold bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                        {CATEGORY_LABELS[issue.category] || issue.category}
                      </span>
                    </div>
                    {issue.subject && <p className="text-xs font-medium text-foreground mt-1">{issue.subject}</p>}
                    <p className="text-sm text-muted-foreground mt-1">{issue.description}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {issue.action && (
                        <Button size="sm" onClick={() => setRepairTarget(issue)} disabled={busyId === issue.id}>
                          {busyId === issue.id ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Wrench className="w-4 h-4 mr-1.5" />}
                          {issue.actionLabel || "Repair"}
                        </Button>
                      )}
                      {issue.href && (
                        <Button size="sm" variant="outline" asChild>
                          <Link to={issue.href}>Review manually <ArrowRight className="w-4 h-4 ml-1.5" /></Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(repairTarget)}
        onClose={() => setRepairTarget(null)}
        onConfirm={() => repairTarget && runRepair(repairTarget)}
        title={repairTarget?.actionLabel || "Repair this issue?"}
        description={repairTarget ? ACTION_DESCRIPTIONS[repairTarget.action] || repairTarget.description : ""}
        confirmText={repairTarget?.actionLabel || "Repair"}
        destructive={repairTarget?.action === "unapprove_driver"}
      />
    </div>
  );
}
