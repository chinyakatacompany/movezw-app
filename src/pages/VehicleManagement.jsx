import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Car, Upload, Check, ShieldCheck } from "lucide-react";
import { VEHICLE_TYPES, VEHICLE_ICONS } from "@/lib/movezw";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { uploadVerificationDocument } from "@/lib/documents";

// Vehicle registration is a real ID-type document, so it goes to the
// private verification-docs bucket (see lib/documents.js), not the public
// bucket used for photos elsewhere in the app.
function DocField({ label, value, onChange }) {
  const [uploading, setUploading] = useState(false);
  const handle = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadVerificationDocument(file);
      onChange(path);
      toast({ title: "Document uploaded" });
    } catch (e) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <label className={cn(
        "flex items-center gap-3 rounded-xl border-2 border-dashed p-4 cursor-pointer transition-colors",
        value ? "border-emerald-300 bg-emerald-50/50" : "border-border hover:border-primary/40"
      )}>
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", value ? "bg-emerald-100 text-emerald-600" : "bg-muted text-muted-foreground")}>
          {value ? <Check className="w-5 h-5" /> : uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          {value ? <p className="text-sm font-medium text-emerald-700">Uploaded ✓</p>
            : uploading ? <p className="text-sm text-muted-foreground">Uploading...</p>
            : <p className="text-sm text-muted-foreground">Tap to upload new document</p>}
        </div>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
      </label>
    </div>
  );
}

export default function VehicleManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleName, setVehicleName] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [vehicleRegistrationUrl, setVehicleRegistrationUrl] = useState("");
  const [locationArea, setLocationArea] = useState("");
  const [regChanged, setRegChanged] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("driver_profiles")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) console.error("Failed to load driver profile:", error);
        const p = data?.[0];
        if (p) {
          setProfile(p);
          setVehicleType(p.vehicle_type || "");
          setVehicleName(p.vehicle_name || "");
          setLicensePlate(p.license_plate || "");
          setVehicleRegistrationUrl(p.vehicle_registration_url || "");
          setLocationArea(p.location_area || "");
        }
      })
      .finally(() => setLoading(false));
  }, [user?.id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!profile) return;
    if (!vehicleType || !vehicleName || !licensePlate || !vehicleRegistrationUrl) {
      toast({ title: "Vehicle type, make/model, licence plate and registration document are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        vehicle_type: vehicleType,
        vehicle_name: vehicleName,
        license_plate: licensePlate,
        vehicle_registration_url: vehicleRegistrationUrl,
        location_area: locationArea,
        verification_status: regChanged && profile.verification_status === "approved" ? "pending" : profile.verification_status,
      };
      const { error } = await supabase.from("driver_profiles").update(payload).eq("id", profile.id);
      if (error) throw error;
      toast({ title: regChanged ? "Vehicle updated — pending re-verification" : "Vehicle details updated" });
      setRegChanged(false);
      navigate("/driver/profile");
    } catch (err) {
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }

  if (!profile) {
    return (
      <div className="p-4 pb-8">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center py-16">
          <Car className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No driver profile found</p>
          <p className="text-sm text-muted-foreground mt-1">Complete driver onboarding to manage your vehicle.</p>
          <Button className="mt-4" onClick={() => navigate("/driver/onboarding")}>Start onboarding</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Vehicle Management</h1>
      <p className="text-sm text-muted-foreground mb-5">Update your vehicle type, specifications and registration document.</p>

      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
        <p className="text-xs text-blue-700">Changing your registration document will require re-verification by our admin team.</p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Car className="w-4 h-4 text-primary" /> Vehicle type</h2>
          <div className="grid grid-cols-2 gap-2">
            {VEHICLE_TYPES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVehicleType(v)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border-2 px-3 py-3 transition-all text-left",
                  vehicleType === v ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                )}
              >
                <span className="text-lg">{VEHICLE_ICONS[v]}</span>
                <span className="text-xs font-medium">{v}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold">Specifications</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="vname">Vehicle make/model</Label>
              <Input id="vname" placeholder="e.g. Toyota Hilux" value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plate">Licence plate</Label>
              <Input id="plate" placeholder="e.g. ADZ 1234" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="area">Operating area</Label>
            <Input id="area" placeholder="e.g. Harare CBD" value={locationArea} onChange={(e) => setLocationArea(e.target.value)} />
          </div>
          <DocField
            label="Vehicle Registration Document"
            value={vehicleRegistrationUrl}
            onChange={(v) => { setVehicleRegistrationUrl(v); setRegChanged(true); }}
          />
        </div>

        <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={saving}>
          {saving ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Saving...</> : "Save changes"}
        </Button>
      </form>
    </div>
  );
}
