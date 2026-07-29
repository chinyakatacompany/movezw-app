import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Package, Loader2, Search, X, CheckCircle2, Ban } from "lucide-react";
import { StatusBadge, STATUS_LABELS, formatMoney, formatDate, notifyJobStatusChange } from "@/lib/movezw";
import { processCancellationRefund, processJobCompletion } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import ConfirmDialog from "@/components/shared/ConfirmDialog";

const FILTERS = ["all", "open", "confirmed", "in_transit", "delivered", "completed", "cancelled"];

export default function AdminJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = () => {
    base44.entities.TransportRequest
      .filter(filter === "all" ? {} : { status: filter }, "-created_date", 100)
      .then(setJobs)
      .catch(() => setJobs([]));
  };

  useEffect(() => {
    load();
    setSelected(new Set());
    /* eslint-disable-next-line */
  }, [filter]);

  const filtered = (jobs || []).filter((j) =>
    !q ||
    (j.pickup_location || "").toLowerCase().includes(q.toLowerCase()) ||
    (j.destination || "").toLowerCase().includes(q.toLowerCase()) ||
    (j.customer_name || "").toLowerCase().includes(q.toLowerCase()) ||
    (j.cargo_type || "").toLowerCase().includes(q.toLowerCase())
  );

  const allSelected = filtered.length > 0 && filtered.every((j) => selected.has(j.id));
  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(filtered.map((j) => j.id)));
  const clearSelection = () => setSelected(new Set());

  const runBulk = async () => {
    const type = confirm?.type;
    if (!type) return;
    setBusy(true);
    try {
      const targets = (jobs || []).filter((j) => selected.has(j.id));
      await Promise.all(
        targets.map(async (j) => {
          if (type === "cancel") {
            await base44.entities.TransportRequest.update(j.id, { status: "cancelled" });
            try { await processCancellationRefund({ request: j, actorId: user.id }); } catch { /* best-effort */ }
            try { await notifyJobStatusChange(j, "cancelled", user.id); } catch { /* best-effort */ }
          } else if (type === "complete") {
            await base44.entities.TransportRequest.update(j.id, { status: "completed" });
            if (j.accepted_driver_id) {
              try { await processJobCompletion({ driverId: j.accepted_driver_id, request: j, acceptedPrice: j.accepted_price, actorId: user.id }); } catch { /* best-effort */ }
              try { await notifyJobStatusChange(j, "completed", user.id); } catch { /* best-effort */ }
            }
          }
        })
      );
      toast({ title: `${targets.length} job${targets.length > 1 ? "s" : ""} ${type === "cancel" ? "cancelled" : "completed"}` });
      setSelected(new Set());
      setConfirm(null);
      load();
    } catch (e) {
      toast({ title: "Bulk action failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto pb-28">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Job management</h1>
      <p className="text-sm text-muted-foreground mb-5">All transport requests on the platform.</p>

      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-medium capitalize whitespace-nowrap transition-colors",
              filter === f ? "bg-primary text-primary-foreground" : "bg-white border border-border text-foreground hover:bg-muted"
            )}
          >
            {f === "all" ? "All" : STATUS_LABELS[f] || f}
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by route, customer, cargo..."
          className="w-full h-10 pl-10 pr-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {jobs === null ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border py-16 text-center">
          <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No jobs found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border divide-y divide-border">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/40">
            <button onClick={toggleAll} className="p-1 rounded hover:bg-muted" aria-label="Select all">
              {allSelected ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <span className="block w-5 h-5 rounded-md border-2 border-border" />}
            </button>
            <span className="text-xs font-medium text-muted-foreground">
              {allSelected ? "All selected" : "Select all"}
            </span>
          </div>
          {filtered.map((j) => {
            const checked = selected.has(j.id);
            return (
              <div key={j.id} className={cn("p-4 flex items-center gap-3 transition-colors", checked && "bg-primary/5")}>
                <button onClick={() => toggle(j.id)} className="p-1 shrink-0" aria-label="Select job">
                  {checked ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <span className="block w-5 h-5 rounded-md border-2 border-border" />}
                </button>
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{j.cargo_type} · {j.pickup_location} → {j.destination}</p>
                  <p className="text-xs text-muted-foreground">{j.customer_name || "Customer"} · {formatDate(j.created_date)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-primary">{formatMoney(j.accepted_price || j.budget)}</p>
                  <div className="mt-1"><StatusBadge status={j.status} /></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-4 inset-x-0 z-40 flex justify-center px-4">
          <div className="w-full max-w-3xl bg-white border border-border rounded-2xl shadow-lg p-3 flex items-center gap-3">
            <span className="text-sm font-semibold pl-1">{selected.size} selected</span>
            <button onClick={clearSelection} className="text-muted-foreground hover:text-foreground p-1" aria-label="Clear selection">
              <X className="w-4 h-4" />
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setConfirm({ type: "complete", count: selected.size })}
              disabled={busy}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" /> Complete
            </button>
            <button
              onClick={() => setConfirm({ type: "cancel", count: selected.size })}
              disabled={busy}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 disabled:opacity-50"
            >
              <Ban className="w-4 h-4" /> Cancel
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => !busy && setConfirm(null)}
        onConfirm={runBulk}
        title={confirm?.type === "cancel" ? `Cancel ${confirm?.count} job(s)?` : `Mark ${confirm?.count} job(s) as completed?`}
        description={
          confirm?.type === "cancel"
            ? "The selected requests will be cancelled. Drivers will be notified, and any commission held after loading will be queued for refund review."
            : "The selected jobs will be marked completed. Drivers will be credited their earnings and notified."
        }
        confirmText={confirm?.type === "cancel" ? "Cancel jobs" : "Mark completed"}
        destructive={confirm?.type === "cancel"}
      />
    </div>
  );
}
