import React, { useEffect, useState } from "react";
import { Settings, Loader2, ShieldCheck } from "lucide-react";
import { updateCommissionSettings } from "@/lib/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";

export default function CommissionSettings({ cfg, adminId }) {
  const [rate, setRate] = useState("");
  const [threshold, setThreshold] = useState("");
  const [policy, setPolicy] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!cfg) return;
    setRate(String(Math.round((cfg.rate ?? 0.1) * 100)));
    setThreshold(String(cfg.low_balance_threshold ?? 5));
    setPolicy(cfg.cancellation_policy_note || "");
  }, [cfg]);

  const save = async () => {
    setSaving(true);
    try {
      await updateCommissionSettings(
        { rate: Number(rate) / 100, lowBalanceThreshold: Number(threshold), policyNote: policy },
        { id: adminId }
      );
      toast({ title: "Commission settings saved" });
    } catch (e) {
      toast({ title: "Could not save settings", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-2xl border border-border p-5 card-shadow">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold">Commission & cancellation policy</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="rate">Platform commission rate (%)</Label>
            <Input id="rate" type="number" min="0" max="50" value={rate} onChange={(e) => setRate(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Deducted from the driver's wallet when cargo is collected.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="threshold">Low-balance alert threshold (USD)</Label>
            <Input id="threshold" type="number" min="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Drivers are alerted below this balance.</p>
          </div>
        </div>
        <div className="space-y-2 mt-4">
          <Label htmlFor="policy">Cancellation / refund policy</Label>
          <Textarea id="policy" rows={3} value={policy} onChange={(e) => setPolicy(e.target.value)} placeholder="e.g. 100% refund before loading; after loading, admin approval required." />
        </div>
        <div className="flex justify-end mt-4">
          <Button onClick={save} disabled={saving} className="min-w-32">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <>Save settings</>}
          </Button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800">
          Refunds for cancellations <strong>before cargo loading</strong> are automatic (nothing is charged yet). Refunds <strong>after loading</strong> appear in the Refunds tab for your approval; the driver claims the approved amount into their wallet.
        </p>
      </div>
    </div>
  );
}
