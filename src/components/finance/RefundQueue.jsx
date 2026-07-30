import React, { useState } from "react";
import { Check, X, Loader2, RotateCcw } from "lucide-react";
import { formatMoney, formatDate } from "@/lib/movezw";
import { approveRefundRequest, rejectRefundRequest } from "@/lib/payments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

const statusStyle = {
  pending: "bg-amber-50 text-amber-600",
  approved: "bg-blue-50 text-blue-600",
  paid: "bg-emerald-50 text-emerald-600",
  rejected: "bg-rose-50 text-rose-600",
};

export default function RefundQueue({ refunds = [], adminId, onChanged }) {
  const pending = refunds.filter((r) => r.status === "pending");
  const decided = refunds.filter((r) => r.status !== "pending").slice(0, 10);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);

  const act = async (type, r) => {
    setBusy(r.id);
    try {
      const note = notes[r.id] || "";
      if (type === "approve") await approveRefundRequest(r.id, adminId, note);
      else await rejectRefundRequest(r.id, adminId, note);
      toast({ title: type === "approve" ? "Refund approved" : "Refund rejected" });
      onChanged?.();
    } catch (e) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <RotateCcw className="w-4 h-4 text-accent" />
          <h2 className="text-base font-semibold">Pending approval</h2>
          <span className="text-xs text-muted-foreground">{pending.length} request(s)</span>
        </div>
        {pending.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">
            No refund requests awaiting approval.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <div key={r.id} className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{formatMoney(r.amount)} refund</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Requested {formatDate(r.requested_at)} · Job {String(r.request_id || "").slice(-6).toUpperCase()}</p>
                  </div>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full shrink-0", statusStyle.pending)}>Pending</span>
                </div>
                <Textarea
                  placeholder="Admin note (optional)"
                  value={notes[r.id] || ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  rows={2}
                  className="mt-3"
                />
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => act("approve", r)} disabled={busy === r.id} className="bg-emerald-600 hover:bg-emerald-700">
                    {busy === r.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />} Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => act("reject", r)} disabled={busy === r.id}>
                    {busy === r.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <X className="w-4 h-4 mr-1" />} Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {decided.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Recent decisions</h2>
          <div className="bg-card rounded-2xl border border-border divide-y divide-border">
            {decided.map((r) => (
              <div key={r.id} className="p-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{formatMoney(r.amount)} · {r.reason}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(r.decided_at || r.requested_at)}{r.admin_note ? ` · ${r.admin_note}` : ""}</p>
                </div>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full", statusStyle[r.status] || "bg-muted")}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
