import React, { useState } from "react";
import { Check, X, Loader2, Wallet } from "lucide-react";
import { formatMoney, formatDate } from "@/lib/movezw";
import { approveTopUp, rejectTopUp } from "@/lib/payments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

const statusStyle = {
  pending: "bg-amber-50 text-amber-600",
  completed: "bg-emerald-50 text-emerald-600",
  failed: "bg-rose-50 text-rose-600",
};

export default function TopupQueue({ topups = [], driverNames = {}, onChanged }) {
  const pending = topups.filter((t) => t.status === "pending");
  const decided = topups.filter((t) => t.status !== "pending").slice(0, 10);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);

  const act = async (type, t) => {
    setBusy(t.id);
    try {
      const note = notes[t.id] || "";
      if (type === "approve") await approveTopUp(t.id);
      else await rejectTopUp(t.id, note);
      toast({ title: type === "approve" ? "Top up approved" : "Top up rejected" });
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
          <Wallet className="w-4 h-4 text-accent" />
          <h2 className="text-base font-semibold">Pending approval</h2>
          <span className="text-xs text-muted-foreground">{pending.length} request(s)</span>
        </div>
        {pending.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">
            No top up requests awaiting approval.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((t) => (
              <div key={t.id} className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{formatMoney(t.amount)} top up</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{driverNames[t.user_id] || "Driver"} · {t.method}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Requested {formatDate(t.created_at)} · Ref {t.reference}</p>
                  </div>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full shrink-0", statusStyle.pending)}>Pending</span>
                </div>
                <Textarea
                  placeholder="Admin note (optional, shown to driver if rejected)"
                  value={notes[t.id] || ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))}
                  rows={2}
                  className="mt-3"
                />
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => act("approve", t)} disabled={busy === t.id} className="bg-emerald-600 hover:bg-emerald-700">
                    {busy === t.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />} Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => act("reject", t)} disabled={busy === t.id}>
                    {busy === t.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <X className="w-4 h-4 mr-1" />} Reject
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
            {decided.map((t) => (
              <div key={t.id} className="p-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{formatMoney(t.amount)} · {driverNames[t.user_id] || "Driver"}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(t.created_at)}{t.note ? ` · ${t.note}` : ""}</p>
                </div>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full", statusStyle[t.status] || "bg-muted")}>{t.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
