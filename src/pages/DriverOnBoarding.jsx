import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, FileCheck2, Car, Upload, Check } from "lucide-react";
import { VEHICLE_TYPES, VEHICLE_ICONS } from "@/lib/movezw";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

function DocField({ label, value, onChange, required }) {
  const [uploading, setUploading] = useState(false);
  const handle = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      onChange(file_url);
    } catch (e) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };
  return (
    <div>
      <Label className="mb-1.5 block">{label} {required && <span className="text-destructive">*</span>}</Label>
      <label className={cn(
        "flex items-center gap-3 rounded-xl border-2 border-dashed p-4 cursor-pointer transition-colors",
        value ? "border-emerald-300 bg-emerald-50/50" : "border-border hover:border-primary/40"
      )}>
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", value ? "bg-emerald-100 text-emerald-600" : "bg-muted text-muted-foreground")}>
          {value ? <Check className="w-5 h-5" /> : uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          {value ? (
            <p className="text-sm font-medium text-emerald-700">Uploaded ✓</p>
          ) : uploading ? (
            <p className="text-sm text-muted-foreground">Uploading...</p>
          ) : (
            <p className="text-sm text-muted-foreground">Tap to upload photo</p>
          )}
        </div>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
      </label>
    </div>
  );
}

export default function DriverOnboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    location_area: "",
    vehicle_type: "Pickup",
    national_id_url: "",
    driver_licence_url: "",
    vehicle_registration_url: "",
    profile_picture_url: "",
  });
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    base44.entities.DriverProfile.filter({ user_id: user.id }, "-created_date", 1)
      .then((r) => {
        const p = r[0];
        if (p) {
          setExisting(p);
          setForm({
            full_name: p.full_name || "",
            phone: p.phone || "",
            location_area: p.location_area || "",
            vehicle_type: p.vehicle_type || "Pickup",
            national_id_url: p.national_id_url || "",
            driver_licence_url: p.driver_licence_url || "",
            vehicle_registration_url: p.vehicle_registration_url || "",
            profile_picture_url: p.profile_picture_url || "",
          });
        } else {
          setForm((f) => ({ ...f, full_name: user.full_name || "", phone: user.phone || "" }));
        }
      })
      .finally(() => setLoading(false));
  }, [user?.id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.national_id_url || !form.driver_licence_url || !form.vehicle_registration_url) {
      toast({ title: "All three documents are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      try { await base44.auth.updateMe({ role: "driver" }); } catch (_) {}
      const payload = {
        user_id: user.id,
        full_name: form.full_name,
        phone: form.phone,
        location_area: form.location_area,
        vehicle_type: form.vehicle_type,
        national_id_url: form.national_id_url,
        driver_licence_url: form.driver_licence_url,
        vehicle_registration_url: form.vehicle_registration_url,
        profile_picture_url: form.profile_picture_url,
        verification_status: existing?.verification_status === "approved" ? "approved" : "pending",
      };
      if (existing) {
        await base44.entities.DriverProfile.update(existing.id, payload);
      } else {
        await base44.entities.DriverProfile.create({ ...payload, rating_avg: 0, rating_count: 0, completed_jobs: 0 });
      }
      sessionStorage.removeItem("movzw_signup_role");
      toast({ title: existing ? "Profile updated" : "Application submitted!", description: "Our team will verify your documents shortly." });
      navigate("/driver");
    } catch (err) {
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }

  return (
    <div className="p-4 pb-8">
      <button onClick={() => navigate("/driver")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold tracking-tight mb-1">{existing ? "Edit driver profile" : "Become a driver"}</h1>
      <p className="text-sm text-muted-foreground mb-6">Upload your documents to start receiving transport jobs.</p>

      <form onSubmit={submit} className="space-y-5">
        <div className="bg-white rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold">Profile</h2>
          <div className="flex justify-center">
            <label className="relative cursor-pointer">
              <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {form.profile_picture_url ? (
                  <img src={form.profile_picture_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Upload className="w-7 h-7 text-muted-foreground" />
                )}
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
                set("profile_picture_url", file_url);
              }} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="name">Full name *</Label>
              <Input id="name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="area">Operating area</Label>
            <Input id="area" placeholder="e.g. Harare CBD" value={form.location_area} onChange={(e) => set("location_area", e.target.value)} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Car className="w-4 h-4 text-primary" /> Vehicle type</h2>
          <div className="grid grid-cols-2 gap-2">
            {VEHICLE_TYPES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => set("vehicle_type", v)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border-2 px-3 py-3 transition-all text-left",
                  form.vehicle_type === v ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                )}
              >
                <span className="text-lg">{VEHICLE_ICONS[v]}</span>
                <span className="text-xs font-medium">{v}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-primary" /> Documents</h2>
          <DocField label="National ID" value={form.national_id_url} onChange={(v) => set("national_id_url", v)} required />
          <DocField label="Driver's Licence" value={form.driver_licence_url} onChange={(v) => set("driver_licence_url", v)} required />
          <DocField label="Vehicle Registration" value={form.vehicle_registration_url} onChange={(v) => set("vehicle_registration_url", v)} required />
        </div>

        <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={saving}>
          {saving ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Saving...</> : existing ? "Save changes" : "Submit application"}
        </Button>
      </form>
    </div>
  );
}