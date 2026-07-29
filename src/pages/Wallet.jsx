import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Wallet as WalletIcon, Loader2, ArrowDownLeft, ArrowUpRight,
  Download, Banknote, TrendingUp, Percent, CheckCircle2, Clock, X, AlertTriangle, Plus,
} from "lucide-react";
import { PAYMENT_METHODS, formatMoney, formatDate, EmptyState } from "@/lib/movezw";
import { ensureWallet, requestPayout, requestTopUp, claimRefund as claimRefundFn, getCommissionConfig } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

const TYPE_META = {
  credit: { label: "Earnings", in: true },
  escrow_hold: { label: "Escrow hold", in: false },
  escrow_release: { label: "Escrow release", in: true },
  commission: { label: "Commission", in: false },
  payout: { label: "Payout", in: false },
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
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPayout, setShowPayout] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("ecocash");
  const [payoutDest, setPayoutDest] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupMethod, setTopupMethod] = useState("ecocash");
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
      const [txs, pays] = await Promise.all([
        base44.entities.Transaction.filter({ user_id: user.id }, "-created_date", 100),
        isDriver ? base44.entities.Payout.filter({ driver_id: user.id }, "-created_date", 50) : Promise.resolve([]),
      ]);
      setTransactions(txs);
      setPayouts(pays);
      try {
        const cfg = await getCommissionConfig();
        setLowThreshold(cfg.low_balance_threshold ?? 5);
      } catch { /* ignore */ }
      if (isDriver) {
        try {
          const rrs = await base44.entities.RefundRequest.filter({ driver_id: user.id, status: { $in: ["pending", "approved"] } }, "-created_date", 50);
          setRefundReqs(rrs);
        } catch { /* ignore */ }
      }
    } catch (e) {
      /* ignore */
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const submitPayout = async (e) => {
    e.preventDefault();
    setProcessing(true);
    try {
      const { payout } = await requestPayout({
        driverId: user.id,
        amount: payoutAmount,
        method: payoutMethod,
        destination: payoutDest,
      });
      try {
        await base44.entities.Notification.create({
          user_id: user.id,
          type: "admin",
          title: "Payout requested",
          message: `Your payout of ${formatMoney(payoutAmount)} to ${payoutMethod} is being processed.`,
          link: "/wallet",
        });
      } catch (_) {}
      toast({ title: "Payout requested", description: `${formatMoney(payoutAmount)} to ${payoutMethod}` });
      setShowPayout(false);
      setPayoutAmount("");
      setPayoutDest("");
      load();
    } catch (err) {
      toast({ title: "Could not request payout", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const submitTopUp = async (e) => {
    e.preventDefault();
    setTopupProcessing(true);
    try {
      await requestTopUp({ userId: user.id, amount: topupAmount, method: topupMethod, destination: topupDest });
      toast({ title: "Wallet topped up", description: `${formatMoney(topupAmount)} via ${topupMethod}` });
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
      toast({ title: "Refund claimed", description: `${formatMoney(rr.amount)} added to your wallet` });
      load();
    } catch (err) {
      toast({ title: "Could not claim refund", description: err.message, variant: "destructive" });
    } finally {
      setClaiming(null);
    }
  };

  const totalSpent = useMemo(
    () => transactions.filter((t) => t.direction === "out" && t.type !== "payout").reduce((s, t) => s + (t.amount || 0), 0),
    [transactions]
  );

  if (loading || !wallet) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }

  return (
    <div className="p-4 pb-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Wallet</h1>
      <p className="text-sm text-muted-foreground mb-5">Balance, transactions, invoices and payouts.</p>

      {/* Balance card */}
      <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-600 p-5 text-primary-foreground shadow-lg mb-5">
        <div className="flex items-center justify-between">
          <span className="text-sm opacity-90">Available balance</span>
          <WalletIcon className="w-5 h-5 opacity-90" />
        </div>
        <p className="text-3xl font-bold mt-1">{formatMoney(wallet.balance)}</p>
        <div className="flex gap-6 mt-4">
          <div>
            <p className="text-xs opacity-75">{isDriver ? "Pending / escrow" : "Pending"}</p>
            <p className="text-base font-semibold">{formatMoney(wallet.pending)}</p>
          </div>
          {isDriver && (
            <div>
              <p className="text-xs opacity-75">Lifetime earned</p>
              <p className="text-base font-semibold">{formatMoney(wallet.total_earned)}</p>
            </div>
          )}
        </div>
      </div>

      {isDriver && (wallet.balance || 0) < lowThreshold && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-3.5 mb-5">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Low wallet balance</p>
            <p className="text-xs text-amber-700 mt-0.5">Top up to keep accepting jobs — a commission is held in escrow when you collect cargo.</p>
          </div>
        </div>
      )}

      {/* Stat chips */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {isDriver ? (
          <>
            <Stat icon={TrendingUp} color="text-emerald-500" label="Earned" value={formatMoney(wallet.total_earned)} />
            <Stat icon={Percent} color="text-amber-500" label="Commission" value={formatMoney(wallet.total_commission)} />
            <Stat icon={Banknote} color="text-blue-500" label="Paid out" value={formatMoney(wallet.total_paid_out)} />
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
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Button onClick={() => setShowTopUp(true)} variant="outline" className="h-12 font-semibold">
            <Plus className="w-4 h-4 mr-2" /> Top up
          </Button>
          <Button onClick={() => setShowPayout(true)} className="h-12 font-semibold">
            <Banknote className="w-4 h-4 mr-2" /> Payout
          </Button>
        </div>
      )}

      {/* Payment methods (placeholder integrations) */}
      <div className="bg-white rounded-2xl border border-border p-4 mb-5">
        <h2 className="text-sm font-semibold mb-1">Payment methods</h2>
        <p className="text-xs text-muted-foreground mb-3">Live gateways connect here later without database changes.</p>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <div key={m.id} className="flex flex-col items-center gap-1 rounded-xl border border-border p-3 text-center">
              <span className="text-xl">{m.icon}</span>
              <span className="text-[11px] font-medium">{m.label}</span>
              <span className="text-[9px] text-muted-foreground">{m.group}</span>
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
        <div className="bg-white rounded-2xl border border-border">
          <EmptyState icon={WalletIcon} title="No transactions yet" subtitle="Your payments, earnings and payouts will appear here." />
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {transactions.map((t) => {
            const meta = TYPE_META[t.type] || { label: t.type, in: t.direction === "in" };
            const isIn = t.direction === "in";
            const StatusIcon = t.status === "completed" ? CheckCircle2 : t.status === "pending" ? Clock : X;
            return (
              <div key={t.id} className="bg-white rounded-2xl border border-border p-3.5 flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", isIn ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                  {isIn ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{meta.label}</p>
                    <span className={cn("inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full", t.status === "completed" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                      <StatusIcon className="w-3 h-3" /> {t.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{t.reference || t.method} · {formatDate(t.created_date)}</p>
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

      {/* Payouts (driver) */}
      {isDriver && payouts.length > 0 && (
        <>
          <h2 className="text-base font-semibold mb-3">Payout records</h2>
          <div className="space-y-2">
            {payouts.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl border border-border p-3.5 flex items-center gap-3">
                <Banknote className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{formatMoney(p.amount)} · {p.method}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.destination || "—"} · {formatDate(p.created_date)}</p>
                </div>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full", p.status === "completed" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>{p.status}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {isDriver && refundReqs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-semibold mb-3">Commission refunds</h2>
          <div className="space-y-2">
            {refundReqs.map((rr) => (
              <div key={rr.id} className="bg-white rounded-2xl border border-border p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{formatMoney(rr.amount)} · {rr.reason}</p>
                  <p className="text-xs text-muted-foreground truncate">{formatDate(rr.requested_at || rr.created_date)} · {rr.status}</p>
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

      {/* Payout modal */}
      {showPayout && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setShowPayout(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Request payout</h2>
            <p className="text-sm text-muted-foreground mb-4">Transfer your balance to a mobile wallet or bank account.</p>
            <form onSubmit={submitPayout} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (USD)</Label>
                <Input id="amount" type="number" min="1" max={wallet.balance} value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} placeholder={`Max ${formatMoney(wallet.balance)}`} required />
              </div>
              <div className="space-y-2">
                <Label>Payout method</Label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.filter((m) => ["ecocash", "onemoney", "zipit", "bank"].includes(m.id)).map((m) => (
                    <button key={m.id} type="button" onClick={() => setPayoutMethod(m.id)}
                      className={cn("flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left", payoutMethod === m.id ? "border-primary bg-primary/5" : "border-border")}>
                      <span>{m.icon}</span><span className="text-xs font-medium">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dest">Destination (mobile number / account)</Label>
                <Input id="dest" value={payoutDest} onChange={(e) => setPayoutDest(e.target.value)} placeholder="e.g. 0772 000 000" required />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowPayout(false)}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={processing}>
                  {processing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</> : "Confirm payout"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTopUp && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setShowTopUp(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Top up wallet</h2>
            <p className="text-sm text-muted-foreground mb-4">Add funds via mobile money, card or bank. (Placeholder gateway)</p>
            <form onSubmit={submitTopUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tamount">Amount (USD)</Label>
                <Input id="tamount" type="number" min="1" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} placeholder="e.g. 20" required />
              </div>
              <div className="space-y-2">
                <Label>Method</Label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.filter((m) => ["ecocash", "onemoney", "zipit", "visa", "mastercard", "bank"].includes(m.id)).map((m) => (
                    <button key={m.id} type="button" onClick={() => setTopupMethod(m.id)}
                      className={cn("flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left", topupMethod === m.id ? "border-primary bg-primary/5" : "border-border")}>
                      <span>{m.icon}</span><span className="text-xs font-medium">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tdest">Destination (mobile number / account)</Label>
                <Input id="tdest" value={topupDest} onChange={(e) => setTopupDest(e.target.value)} placeholder="e.g. 0772 000 000" />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowTopUp(false)}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={topupProcessing}>
                  {topupProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</> : "Confirm top up"}
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
    <div className="bg-white rounded-2xl border border-border p-3">
      <Icon className={cn("w-4 h-4 mb-1", color)} />
      <p className="text-sm font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
