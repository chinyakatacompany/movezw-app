import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Receipt, Loader2, Download, CheckCircle2, Clock, Banknote } from "lucide-react";
import { formatMoney, formatDate, EmptyState } from "@/lib/movezw";
import { cn } from "@/lib/utils";

const PAY_LABELS = {
  paid: { label: "Paid", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  pending: { label: "Pending", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
  cod: { label: "Cash on delivery", cls: "bg-blue-50 text-blue-700 border-blue-200", icon: Banknote },
};

export default function PaymentHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    const isDriver = user.role === "driver";
    let query = supabase.from("transport_requests").select("*").in("status", ["delivered", "completed"]).order("updated_at", { ascending: false }).limit(100);
    query = isDriver ? query.eq("accepted_driver_id", user.id) : query.eq("customer_id", user.id);
    query.then(({ data, error }) => {
      if (error) console.error("Failed to load payment history:", error);
      setPayments(data || []);
    }).finally(() => setLoading(false));
  }, [user?.id]);

  const total = payments.reduce((s, p) => s + (p.accepted_price || 0), 0);
  const paidCount = payments.filter((p) => p.payment_status === "paid").length;

  return (
    <div className="p-4 pb-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Payment History</h1>
      <p className="text-sm text-muted-foreground mb-5">Completed deliveries and their payment status.</p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Total settled</p>
          <p className="text-xl font-bold text-foreground mt-1">{formatMoney(total)}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Completed payments</p>
          <p className="text-xl font-bold text-foreground mt-1">{paidCount}/{payments.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No payments yet"
          subtitle="Your completed deliveries and invoices will appear here."
        />
      ) : (
        <div className="space-y-3">
          {payments.map((p) => {
            const ps = PAY_LABELS[p.payment_status] || PAY_LABELS.cod;
            const PsIcon = ps.icon;
            const invNo = `INV-${(p.id || "").slice(-6).toUpperCase()}`;
            return (
              <div key={p.id} className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{p.pickup_location} → {p.destination}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{invNo} · {formatDate(p.updated_at)}</p>
                  </div>
                  <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border shrink-0", ps.cls)}>
                    <PsIcon className="w-3 h-3" /> {ps.label}
                  </span>
                </div>
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground capitalize">{p.cargo_type?.toLowerCase()}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-base font-bold text-foreground">{formatMoney(p.accepted_price)}</span>
                    <button
                      onClick={() => window.print()}
                      className="w-8 h-8 rounded-lg bg-muted hover:bg-muted/70 flex items-center justify-center"
                      aria-label="Download invoice"
                    >
                      <Download className="w-4 h-4 text-foreground" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
