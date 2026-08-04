import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

const INDUSTRIES = ["Logistics", "Retail", "Manufacturing", "Agriculture", "Construction", "Other"];

export default function BusinessOnboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    company_name: "",
    industry: "Logistics",
    contact_email: user?.email || "",
    contact_phone: "",
    address: "",
    tax_id: "",
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from("businesses").insert({
        owner_id: user.id,
        company_name: form.company_name,
        industry: form.industry,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        address: form.address || undefined,
        tax_id: form.tax_id || undefined,
        status: "active",
      });
      if (error) throw error;
      sessionStorage.removeItem("movzw_signup_role");
      sessionStorage.removeItem("movzw_signup_user_id");
      toast({ title: "Business account created", description: "Welcome to MoveZW Business." });
      navigate("/business");
    } catch (err) {
      toast({ title: "Could not create business", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <button onClick={() => navigate("/")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-card rounded-2xl border border-border card-shadow p-6 animate-rise">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Set up your business</h1>
              <p className="text-sm text-muted-foreground">Register your company to manage a fleet.</p>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cn">Company name</Label>
              <Input id="cn" required value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Moyo Logistics Pvt Ltd" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ind">Industry</Label>
                <select id="ind" value={form.industry} onChange={(e) => set("industry", e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax">Tax / reg. ID</Label>
                <Input id="tax" value={form.tax_id} onChange={(e) => set("tax_id", e.target.value)} placeholder="BP-1234" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="em">Contact email</Label>
              <Input id="em" type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ph">Phone</Label>
                <Input id="ph" value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} placeholder="0772 123 456" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ad">Address</Label>
                <Input id="ad" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Harare" />
              </div>
            </div>
            <Button type="submit" className="w-full h-12" disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : "Create business account"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
