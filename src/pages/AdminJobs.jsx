import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Package, Loader2, Search, X, CheckCircle2, Ban, Navigation, ChevronDown, ChevronUp, Eye, Users } from "lucide-react";
import { StatusBadge, STATUS_LABELS, formatMoney, formatDate, notifyJobStatusChange } from "@/lib/movezw";
import { cancelTransportRequest, processJobCompletion } from "@/lib/payments";
import { ADMIN_ACTIVE_STATUSES, advanceAdminJob } from "@/lib/adminJobs";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import AdminJobTracker from "@/components/admin/AdminJobTracker";

const FILTERS = ["all", "active", "open", ...ADMIN_ACTIVE_STATUSES, "completed", "cancelled"];

function AdminJobViewers({ jobId, adminId }) {
  const [viewers, setViewers] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!jobId) return undefined;

    const channel = supabase.channel(`job-presence-${jobId}`, {
      config: { presence: { key: `admin-${adminId || "viewer"}` } },
    });
    const syncViewers = () => {
      const unique = new Map();
      Object.entries(channel.presenceState()).forEach(([presenceKey, presences]) => {
        (presences || []).forEach((presence) => {
          // Admins and customers join read-only and never publish driver data,
          // so exclude any presence item that has no driver identity.
          if (!presence.driver_id && !presence.driver_name) return;
          const driverId = presence.driver_id || presenceKey;
          unique.set(driverId, {
            id: driverId,
            name: presence.driver_name || "Driver",
            vehicleType: presence.vehicle_type || null,
          });
        });
      });
      setViewers(Array.from(unique.values()));
    };

    channel
      .on("presence", { event: "sync" }, syncViewers)
      .on("presence", { event: "join" }, syncViewers)
      .on("presence", { event: "leave" }, syncViewers)
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      setViewers([]);
      setConnected(false);
      supabase.removeChannel(channel);
    };
  }, [jobId, adminId]);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3" aria-live="polite">
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-4 h-4 text-primary" />
        <p className="text-xs font-semibold">Drivers viewing now</p>
        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{viewers.length}</span>
      </div>
      {!connected ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting to live viewers…
        </div>
      ) : viewers.length === 0 ? (
        <p className="text-xs text-muted-foreground">No drivers are viewing this job right now.</p>
      ) : (
        <div className="space-y-2">
          {viewers.map((driver) => (
            <div key={driver.id} className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 border border-border/70">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{driver.name}</p>
                <p className="text-[11px] text-muted-foreground">{driver.vehicleType || "Vehicle not specified"} · viewing now</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [statusConfirm, setStatusConfirm] = useState(null);
  const [trackingJobId, setTrackingJobId] = useState(null);
  const [viewersJobId, setViewersJobId] = useState(null);

  const load = useCallback(async () => {
    // The database cron remains authoritative. Running the same protected
    // cleanup here ensures an overdue request is persisted as cancelled before
    // the admin list is read, even if a cron tick was delayed.
    const { error: expiryError } = await supabase.rpc("fn_admin_expire_open_requests");
    if (expiryError && expiryError.code !== "PGRST202") {
      console.warn("Could not refresh expired requests:", expiryError.message);
    }
    let query = supabase.from("transport_requests").select("*").order("created_at", { ascending: false }).limit(100);
    if (filter === "active") query = query.in("status", ADMIN_ACTIVE_STATUSES);
    else if (filter !== "all") query = query.eq("status", filter);
    const { data, error } = await query;
    if (error) console.error("Failed to load jobs:", error);
    setJobs(data || []);
  }, [filter]);

  useEffect(() => {
    load();
    setSelected(new Set());
    setTrackingJobId(null);
    setViewersJobId(null);
    const channel = supabase
      .channel(`admin-jobs-live-${filter}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transport_requests" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [filter, load]);

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

  const advanceJob = async (job, nextStatus) => {
    if (busy) return;
    setBusy(true);
    try {
      await advanceAdminJob(job, nextStatus, user.id);
      toast({ title: `Job marked as ${STATUS_LABELS[nextStatus].toLowerCase()}` });
      setStatusConfirm(null);
      load();
    } catch (error) {
      toast({ title: "Status update failed", description: error.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const runBulk = async () => {
    const type = confirm?.type;
    if (!type) return;
    setBusy(true);
    try {
      const targets = (jobs || []).filter((j) => selected.has(j.id));
      await Promise.all(
        targets.map(async (j) => {
          if (type === "cancel") {
            // Cancelling and refunding any already-reserved commission
            // happen atomically — see fn_cancel_transport_request.
            await cancelTransportRequest({ requestId: j.id });
            try { await notifyJobStatusChange(j, "cancelled", user.id); } catch { /* best-effort */ }
          } else if (type === "complete") {
            const { error } = await supabase.from("transport_requests").update({ status: "completed" }).eq("id", j.id);
            if (error) throw error;
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
    <div className="p-4 sm:p-6 max-w-5xl mx-auto pb-28">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Job management</h1>
      <p className="text-sm text-muted-foreground mb-5">All transport requests on the platform.</p>

      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-medium capitalize whitespace-nowrap transition-colors",
              filter === f ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground hover:bg-muted"
            )}
          >
            {f === "all" ? "All" : f === "active" ? "Active jobs" : STATUS_LABELS[f] || f}
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by route, customer, cargo..."
          className="w-full h-10 pl-10 pr-3 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {jobs === null ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border py-16 text-center">
          <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No jobs found.</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border divide-y divide-border">
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
            const isActive = ADMIN_ACTIVE_STATUSES.includes(j.status);
            const trackingOpen = trackingJobId === j.id;
            const viewersOpen = viewersJobId === j.id;
            return (
              <div key={j.id} className={cn("transition-colors", checked && "bg-primary/5")}>
                <div className="p-4 flex items-center gap-3">
                  <button onClick={() => toggle(j.id)} className="p-1 shrink-0" aria-label="Select job">
                    {checked ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <span className="block w-5 h-5 rounded-md border-2 border-border" />}
                  </button>
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{j.cargo_type} · {j.pickup_location} → {j.destination}</p>
                    <p className="text-xs text-muted-foreground">{j.customer_name || "Customer"} · {formatDate(j.created_at)}</p>
                    {j.status === "cancelled" && j.expired_at && (
                      <p className="mt-1 text-xs font-medium text-destructive">Automatically cancelled after 10 hours</p>
                    )}
                    {j.status === "open" && (
                      <button
                        type="button"
                        onClick={() => setViewersJobId(viewersOpen ? null : j.id)}
                        className="inline-flex items-center gap-1.5 mt-2 mr-4 text-xs font-semibold text-primary hover:underline"
                        aria-expanded={viewersOpen}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {viewersOpen ? "Hide live viewers" : "See drivers viewing"}
                        {viewersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {isActive && (
                      <button
                        type="button"
                        onClick={() => setTrackingJobId(trackingOpen ? null : j.id)}
                        className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-primary hover:underline"
                        aria-expanded={trackingOpen}
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        {trackingOpen ? "Hide tracking" : "Track job"}
                        {trackingOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-primary">{formatMoney(j.accepted_price || j.budget)}</p>
                    <div className="mt-1"><StatusBadge status={j.status} /></div>
                  </div>
                </div>
                {trackingOpen && isActive && (
                  <div className="px-4 pb-4 sm:pl-[5.75rem]">
                    <AdminJobTracker
                      job={j}
                      busy={busy}
                      onAdvance={(job, nextStatus) => {
                        if (nextStatus === "completed") setStatusConfirm({ job, nextStatus });
                        else void advanceJob(job, nextStatus);
                      }}
                    />
                  </div>
                )}
                {viewersOpen && j.status === "open" && (
                  <div className="px-4 pb-4 sm:pl-[5.75rem]">
                    <AdminJobViewers jobId={j.id} adminId={user?.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-4 inset-x-0 z-40 flex justify-center px-4">
          <div className="w-full max-w-3xl bg-card border border-border rounded-2xl shadow-lg p-3 flex items-center gap-3">
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
      <ConfirmDialog
        open={!!statusConfirm}
        onClose={() => !busy && setStatusConfirm(null)}
        onConfirm={() => statusConfirm && advanceJob(statusConfirm.job, statusConfirm.nextStatus)}
        title="Complete this delivery?"
        description="Confirm that the cargo has been handed over. The job will be completed and the driver's earnings will be processed."
        confirmText="Complete delivery"
      />
    </div>
  );
}
