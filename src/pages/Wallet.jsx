import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Wallet as WalletIcon, Loader2, ArrowDownLeft, ArrowUpRight,
  Download, Coins, TrendingUp, Percent, CheckCircle2, Clock, X, AlertTriangle, Plus,
} from "lucide-react";
import { PAYMENT_METHODS, formatMoney, formatDate, EmptyState } from "@/lib/movezw";
import { ensureWallet, requestTopUp, claimRefund as claimRefundFn, getCommissionConfig } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

const TYPE_META = {
  credit: { label: "Earnings", in: true },
  escrow_hold: { label: "Escrow hold", in: false },
  escrow_release: { label: "Escrow release", in: true },
  commission: { label: "Commission", in: false },
  topup: { label: "Top up", in: true },
  payment: { label: "Payment", in: false },
  refund: { label: "Refund", in: true },
};

export default function Wallet() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isDriver = user?.role === "driver";
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  // EcoCash is the only top-up method with a working flow behind it right
  // now (see the payment methods card below), so this isn't a user choice.
  const topupMethod = "ecocash";
  const [topupDest, setTopupDest] = useState("");
  const [topupProcessing, setTopupProcessing] = useState(false);
  const [lowThreshold, setLowThreshold] = useState(5);
  const [refundReqs, setRefundReqs] = useState([]);
  const [claiming, setClaiming] = useState(null);

  const load = async () => {
    if (!user?.id) return;
    try {
      const w = await ensureWallet(user.id);
      setWallet(w);
      const { data: txs } = await supabase.from("transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
      setTransactions(txs || []);
      try {
        const cfg = await getCommissionConfig();
        setLowThreshold(cfg.low_balance_threshold ?? 5);
      } catch { /* ignore */ }
      if (isDriver) {
        try {
          const { data: rrs } = await supabase
            .from("refund_requests")
            .select("*")
            .eq("driver_id", user.id)
            .in("status", ["pending", "approved"])
            .order("requested_at", { ascending: false })
            .limit(50);
          setRefundReqs(rrs || []);
        } catch { /* ignore */ }
      }
    } catch (e) {
      console.error("Failed to load wallet:", e);
      toast({ title: "Could not load wallet", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { load();   }, [user?.id]);

  const submitTopUp = async (e) => {
    e.preventDefault();
    setTopupProcessing(true);
    try {
      await requestTopUp({ amount: topupAmount, method: topupMethod, destination: topupDest });
      toast({ title: "Top up requested", description: `${formatMoney(topupAmount)} via ${topupMethod} — pending admin approval.` });
      setShowTopUp(false);
      setTopupAmount("");
      setTopupDest("");
      load();
    } catch (err) {
      toast({ title: "Top up failed", description: err.message, variant: "destructive" });
    } finally {
      setTopupProcessing(false);
    }
  };

  const claimRefundHandler = async (rr) => {
    setClaiming(rr.id);
    try {
      await claimRefundFn({ refundRequestId: rr.id, userId: user.id });
      toast({ title: "Refund claimed", description: `${formatMoney(rr.amount)} added to your commission balance` });
      load();
    } catch (err) {
      toast({ title: "Could not claim refund", description: err.message, variant: "destructive" });
    } finally {
      setClaiming(null);
    }
  };

  const totalSpent = useMemo(
    () => transactions.filter((t) => t.direction === "out").reduce((s, t) => s + (t.amount || 0), 0),
    [transactions]
  );
  const netIncome = Math.max((wallet?.total_earned || 0) - (wallet?.total_commission || 0), 0);

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }

  if (!wallet) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Could not load your wallet. Please try again shortly.
      </div>
    );
  }

  return (
    <div className="p-4 pb-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Wallet</h1>
      <p className="text-sm text-muted-foreground mb-5">
        {isDriver ? "Commission balance, earnings and transaction history." : "Balance and transaction history."}
      </p>

      {/* Balance card */}
      <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-600 p-5 text-primary-foreground shadow-lg mb-5">
        <div className="flex items-center justify-between">
          <span className="text-sm opacity-90">{isDriver ? "Commission balance" : "Available balance"}</span>
          <WalletIcon className="w-5 h-5 opacity-90" />
        </div>
        <p className="text-3xl font-bold mt-1">{formatMoney(wallet.balance)}</p>
        <div className="flex gap-6 mt-4">
          <div>
            <p className="text-xs opacity-75">{isDriver ? "Held in escrow" : "Pending"}</p>
            <p className="text-base font-semibold">{formatMoney(wallet.pending)}</p>
          </div>
          {isDriver && (
            <div>
              <p className="text-xs opacity-75">Net income</p>
              <p className="text-base font-semibold">{formatMoney(netIncome)}</p>
            </div>
          )}
        </div>
      </div>

      {isDriver && (wallet.balance || 0) < lowThreshold && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-3.5 mb-5">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Low commission balance</p>
            <p className="text-xs text-amber-700 mt-0.5">Top up to keep accepting jobs — commission is deducted from this balance automatically when you collect cargo.</p>
          </div>
        </div>
      )}

      {/* Stat chips */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {isDriver ? (
          <>
            <Stat icon={TrendingUp} color="text-emerald-500" label="Earned" value={formatMoney(wallet.total_earned)} />
            <Stat icon={Percent} color="text-amber-500" label="Commission paid" value={formatMoney(wallet.total_commission)} />
            <Stat icon={Coins} color="text-blue-500" label="Net income" value={formatMoney(netIncome)} />
          </>
        ) : (
          <>
            <Stat icon={ArrowUpRight} color="text-amber-500" label="Total spent" value={formatMoney(totalSpent)} />
            <Stat icon={ArrowDownLeft} color="text-emerald-500" label="Top ups" value={transactions.filter((t) => t.type === "topup").length} />
            <Stat icon={Download} color="text-blue-500" label="Invoices" value={transactions.filter((t) => t.reference).length} />
          </>
        )}
      </div>

      {isDriver && (
        <Button onClick={() => setShowTopUp(true)} className="w-full h-12 font-semibold mb-6">
          <Plus className="w-4 h-4 mr-2" /> Top up commission balance
        </Button>
      )}

      {/* Payment methods */}
      <div className="bg-card rounded-2xl border border-border p-4 mb-5">
        <h2 className="text-sm font-semibold mb-1">Payment methods</h2>
        <p className="text-xs text-muted-foreground mb-3">
          {isDriver
            ? "EcoCash is currently supported for topping up your commission balance. More options are on the way."
            : "Cash on Delivery is currently supported for paying your driver. More options are on the way."}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <div
              key={m.id}
              className={cn(
                "relative flex flex-col items-center gap-1 rounded-xl border p-3 text-center",
                m.available ? "border-border" : "border-border opacity-50"
              )}
            >
              <span className="text-xl">{m.icon}</span>
              <span className="text-[11px] font-medium">{m.label}</span>
              <span className="text-[9px] text-muted-foreground">{m.available ? m.group : "Coming soon"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Transactions */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Transaction history</h2>
        <span className="text-xs text-muted-foreground">{transactions.length} records</span>
      </div>
      {transactions.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border">
          <EmptyState icon={WalletIcon} title="No transactions yet" subtitle="Your top-ups, earnings and commission will appear here." />
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {transactions.map((t) => {
            const meta = TYPE_META[t.type] || { label: t.type, in: t.direction === "in" };
            const isIn = t.direction === "in";
            const StatusIcon = t.status === "completed" ? CheckCircle2 : t.status === "pending" ? Clock : X;
            return (
              <div key={t.id} className="bg-card rounded-2xl border border-border p-3.5 flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", isIn ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                  {isIn ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{meta.label}</p>
                    <span className={cn("inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full", t.status === "completed" ? "bg-emerald-50 text-emerald-600" : t.status === "pending" ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600")}>
                      <StatusIcon className="w-3 h-3" /> {t.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{t.reference || t.method} · {formatDate(t.created_at)}</p>
                  {t.type === "topup" && t.status === "pending" && (
                    <p className="text-[11px] text-amber-600 mt-0.5">Awaiting admin approval</p>
                  )}
                  {t.commission > 0 && <p className="text-[11px] text-muted-foreground">Commission {formatMoney(t.commission)}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className={cn("text-sm font-bold", isIn ? "text-emerald-600" : "text-foreground")}>{isIn ? "+" : "−"}{formatMoney(t.amount)}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{t.method}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isDriver && refundReqs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-semibold mb-3">Commission refunds</h2>
          <div className="space-y-2">
            {refundReqs.map((rr) => (
              <div key={rr.id} className="bg-card rounded-2xl border border-border p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{formatMoney(rr.amount)} · {rr.reason}</p>
                  <p className="text-xs text-muted-foreground truncate">{formatDate(rr.requested_at)} · {rr.status}</p>
                </div>
                {rr.status === "approved" ? (
                  <Button size="sm" disabled={claiming === rr.id} onClick={() => claimRefundHandler(rr)}>
                    {claiming === rr.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : "Claim"}
                  </Button>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Pending review</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showTopUp && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setShowTopUp(false)}>
          <div className="bg-card rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Top up commission balance</h2>
            <p className="text-sm text-muted-foreground mb-4">An admin reviews and approves each top up before it's added to your balance.</p>
            <div className="bg-primary/5 border-2 border-primary/20 rounded-xl p-3.5 mb-4">
              <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1.5">📱 Send via EcoCash to</p>
              <p className="text-base font-bold text-foreground">0780269976</p>
              <p className="text-sm text-muted-foreground">ASHER CHINYAKATA</p>
            </div>
            <form onSubmit={submitTopUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tamount">Amount (USD)</Label>
                <Input id="tamount" type="number" min="1" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} placeholder="e.g. 20" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tdest">The number you paid from</Label>
                <Input id="tdest" value={topupDest} onChange={(e) => setTopupDest(e.target.value)} placeholder="e.g. 0772 000 000" />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowTopUp(false)}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={topupProcessing}>
                  {topupProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : "Submit for approval"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, color, label, value }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-3">
      <Icon className={cn("w-4 h-4 mb-1", color)} />
      <p className="text-sm font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
