import React, { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileCheck2, Car, Upload, Check } from "lucide-react";
import { VEHICLE_TYPES, VEHICLE_ICONS } from "@/lib/movezw";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { uploadVerificationDocument } from "@/lib/documents";

async function uploadDocument(file) {
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
  const { error } = await supabase.storage.from("documents").upload(fileName, file);
  if (error) throw error;
  const { data } = supabase.storage.from("documents").getPublicUrl(fileName);
  return data.publicUrl;
}

// National ID, driver's licence, vehicle registration — real ID documents,
// so these go to the private verification-docs bucket (see lib/documents.js)
// rather than the public bucket the profile picture below still uses.
function DocField({ label, value, onChange, required }) {
  const [uploading, setUploading] = useState(false);
  const handle = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadVerificationDocument(file);
      onChange(path);
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

// Shared by DriverOnboarding.jsx (a driver completing their own signup) and
// AdminAssistedOnboarding.jsx (an admin completing it on a driver's behalf,
// e.g. when documents arrived via WhatsApp instead of through the app).
// `userId` is whoever the resulting driver_profiles row belongs to — the
// logged-in driver in the self-service case, or the selected driver in the
// admin case — never assumed to be the current session's own id.
export default function DriverProfileForm({ userId, prefill, existing, autoApprove, submitLabel, onSaved }) {
  const [form, setForm] = useState({
    full_name: prefill?.full_name || "",
    phone: prefill?.phone || "",
    location_area: "",
    vehicle_type: "Pickup",
    vehicle_name: "",
    license_plate: "",
    national_id_url: "",
    driver_licence_url: "",
    vehicle_registration_url: "",
    profile_picture_url: "",
  });
  const [loading, setLoading] = useState(!!existing === false && !prefill);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        full_name: existing.full_name || prefill?.full_name || "",
        phone: existing.phone || prefill?.phone || "",
        location_area: existing.location_area || "",
        vehicle_type: existing.vehicle_type || "Pickup",
        vehicle_name: existing.vehicle_name || "",
        license_plate: existing.license_plate || "",
        national_id_url: existing.national_id_url || "",
        driver_licence_url: existing.driver_licence_url || "",
        vehicle_registration_url: existing.vehicle_registration_url || "",
        profile_picture_url: existing.profile_picture_url || "",
      });
    }
    setLoading(false);

  }, [existing?.id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.vehicle_name || !form.license_plate) {
      toast({ title: "Vehicle make/model and licence plate are required", variant: "destructive" });
      return;
    }
    if (!form.national_id_url || !form.driver_licence_url || !form.vehicle_registration_url) {
      toast({ title: "All three documents are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error: roleErr } = await supabase.from("profiles").update({ role: "driver" }).eq("id", userId);
      if (roleErr) console.error("Failed to set driver role:", roleErr);
      const status = existing?.verification_status === "approved" || autoApprove ? "approved" : "pending";
      const payload = {
        user_id: userId,
        full_name: form.full_name,
        phone: form.phone,
        location_area: form.location_area,
        vehicle_type: form.vehicle_type,
        vehicle_name: form.vehicle_name,
        license_plate: form.license_plate,
        national_id_url: form.national_id_url,
        driver_licence_url: form.driver_licence_url,
        vehicle_registration_url: form.vehicle_registration_url,
        profile_picture_url: form.profile_picture_url,
        verification_status: status,
      };
      let saved;
      if (existing) {
        const { data, error } = await supabase.from("driver_profiles").update(payload).eq("id", existing.id).select().single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await supabase
          .from("driver_profiles")
          .insert({ ...payload, rating_avg: 0, rating_count: 0, completed_jobs: 0 })
          .select()
          .single();
        if (error) throw error;
        saved = data;
      }
      sessionStorage.removeItem("movzw_signup_role");
      sessionStorage.removeItem("movzw_signup_user_id");
      toast({
        title: existing ? "Profile updated" : status === "approved" ? "Driver verified ✅" : "Application submitted!",
        description: status === "approved" ? "This driver can now receive jobs." : "Our team will verify these documents shortly.",
      });
      onSaved?.(saved);
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
    <form onSubmit={submit} className="space-y-5">
      <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
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
              const url = await uploadDocument(f);
              set("profile_picture_url", url);
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

      <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Car className="w-4 h-4 text-primary" /> Vehicle</h2>
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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="vname">Vehicle make/model *</Label>
            <Input id="vname" placeholder="e.g. Toyota Hilux" value={form.vehicle_name} onChange={(e) => set("vehicle_name", e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plate">Licence plate *</Label>
            <Input id="plate" placeholder="e.g. ADZ 1234" value={form.license_plate} onChange={(e) => set("license_plate", e.target.value.toUpperCase())} required />
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-primary" /> Documents</h2>
        <DocField label="National ID" value={form.national_id_url} onChange={(v) => set("national_id_url", v)} required />
        <DocField label="Driver's Licence" value={form.driver_licence_url} onChange={(v) => set("driver_licence_url", v)} required />
        <DocField label="Vehicle Registration" value={form.vehicle_registration_url} onChange={(v) => set("vehicle_registration_url", v)} required />
      </div>

      <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={saving}>
        {saving ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Saving...</> : (submitLabel || (existing ? "Save changes" : "Submit application"))}
      </Button>
    </form>
  );
}
