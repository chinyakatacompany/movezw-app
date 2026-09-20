import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Package, Loader2, Search, X, CheckCircle2, Ban, Navigation, ChevronDown, ChevronUp, Radio } from "lucide-react";
import { StatusBadge, STATUS_FLOW, STATUS_LABELS, formatMoney, formatDate, timeAgo, notifyJobStatusChange } from "@/lib/movezw";
import { cancelTransportRequest, processJobCompletion } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import ConfirmDialog from "@/components/shared/ConfirmDialog";

const RouteMap = React.lazy(() => import("@/components/RouteMap"));
const ACTIVE_STATUSES = ["confirmed", "en_route_pickup", "collected", "in_transit", "delivered"];
const FILTERS = ["all", "active", "open", ...ACTIVE_STATUSES, "completed", "cancelled"];

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

  const load = useCallback(() => {
    let query = supabase.from("transport_requests").select("*").order("created_at", { ascending: false }).limit(100);
    if (filter === "active") query = query.in("status", ACTIVE_STATUSES);
    else if (filter !== "all") query = query.eq("status", filter);
    query.then(({ data, error }) => {
      if (error) console.error("Failed to load jobs:", error);
      setJobs(data || []);
    });
  }, [filter]);

  useEffect(() => {
    load();
    setSelected(new Set());
    setTrackingJobId(null);
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
    if (busy || STATUS_FLOW[STATUS_FLOW.indexOf(job.status) + 1] !== nextStatus) return;
    setBusy(true);
    try {
      const { data: changed, error } = await supabase
        .from("transport_requests")
        .update({ status: nextStatus })
        .eq("id", job.id)
        .eq("status", job.status)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!changed) throw new Error("This job changed before the update. Review its current status and try again.");
      if (nextStatus === "completed" && job.accepted_driver_id) {
        try {
          await processJobCompletion({ driverId: job.accepted_driver_id, request: job, acceptedPrice: job.accepted_price, actorId: user.id });
        } catch (paymentError) {
          console.warn("Admin completion payment processing failed", paymentError);
        }
      }
      try { await notifyJobStatusChange(job, nextStatus, user.id); } catch { /* best-effort */ }
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
            const isActive = ACTIVE_STATUSES.includes(j.status);
            const trackingOpen = trackingJobId === j.id;
            const trackingTarget = j.status === "en_route_pickup"
              ? { lat: j.pickup_lat, lng: j.pickup_lng, label: "Pickup" }
              : { lat: j.destination_lat, lng: j.destination_lng, label: "Destination" };
            const hasDriverLocation = j.driver_lat != null && j.driver_lng != null;
            const hasTrackingTarget = trackingTarget.lat != null && trackingTarget.lng != null;
            const hasFullRoute = j.pickup_lat != null && j.pickup_lng != null && j.destination_lat != null && j.destination_lng != null;
            const showLiveMap = hasDriverLocation && hasTrackingTarget && !["confirmed", "delivered"].includes(j.status);
            const showPlannedMap = !showLiveMap && hasFullRoute;
            const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(j.status) + 1];
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
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold flex items-center gap-2">
                          <Radio className="w-4 h-4 text-primary" /> Live delivery tracking
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {j.driver_location_updated_at ? `Location updated ${timeAgo(j.driver_location_updated_at)}` : "Waiting for driver location"}
                        </span>
                      </div>
                      {showLiveMap ? (
                        <React.Suspense fallback={<div className="h-[280px] rounded-xl bg-muted animate-pulse" />}>
                          <RouteMap
                            from={{ lat: j.driver_lat, lng: j.driver_lng }}
                            to={{ lat: trackingTarget.lat, lng: trackingTarget.lng }}
                            fromLabel="Driver"
                            toLabel={trackingTarget.label}
                            fromColor="#ea580c"
                            height={280}
                          />
                        </React.Suspense>
                      ) : showPlannedMap ? (
                        <React.Suspense fallback={<div className="h-[280px] rounded-xl bg-muted animate-pulse" />}>
                          <RouteMap
                            from={{ lat: j.pickup_lat, lng: j.pickup_lng }}
                            to={{ lat: j.destination_lat, lng: j.destination_lng }}
                            fromLabel="Pickup"
                            toLabel="Destination"
                            height={280}
                          />
                        </React.Suspense>
                      ) : hasDriverLocation ? (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${j.driver_lat}&mlon=${j.driver_lng}#map=17/${j.driver_lat}/${j.driver_lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                        >
                          <Navigation className="w-4 h-4" /> View current driver position
                        </a>
                      ) : (
                        <p className="rounded-xl bg-card border border-border p-3 text-sm text-muted-foreground">
                          {j.status === "confirmed"
                            ? "The driver has not started travelling to the pickup point yet. Live GPS will appear here once the trip begins."
                            : j.status === "delivered"
                              ? "The delivery has arrived and is waiting to be completed."
                              : "No recent GPS position is available. Ask the driver to open the active job and enable location access."}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {showLiveMap
                          ? `Showing the driver's current position and remaining road route to ${trackingTarget.label.toLowerCase()}.`
                          : showPlannedMap
                            ? "Showing the planned pickup-to-destination route. The moving driver position appears once GPS sharing starts."
                            : "Route mapping needs coordinates from the booking or the driver's current GPS position."}
                      </p>
                      {nextStatus && (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/15 pt-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Current progress</p>
                            <p className="text-sm font-semibold">{STATUS_LABELS[j.status]}</p>
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (nextStatus === "completed") setStatusConfirm({ job: j, nextStatus });
                              else void advanceJob(j, nextStatus);
                            }}
                            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Mark as {STATUS_LABELS[nextStatus]}
                          </button>
                        </div>
                      )}
                    </div>
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
