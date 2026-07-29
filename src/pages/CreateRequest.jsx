import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Navigation, DollarSign, Clock, Calendar, Loader2, Package, Zap } from "lucide-react";
import PhotoUpload from "@/components/PhotoUpload";
import { CARGO_TYPES } from "@/lib/movezw";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export default function CreateRequest() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({
    pickup_location: "",
    destination: "",
    cargo_type: "Furniture",
    cargo_weight: "",
    cargo_description: "",
    timing: "now",
    scheduled_date: "",
    budget: "",
  });
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        customer_id: user.id,
        customer_name: user.full_name || user.email,
        pickup_location: form.pickup_location,
        destination: form.destination,
        cargo_type: form.cargo_type,
        cargo_weight: form.cargo_weight || null,
        cargo_description: form.cargo_description,
        photos,
        timing: form.timing,
        scheduled_date: form.timing === "scheduled" ? new Date(form.scheduled_date).toISOString() : null,
        budget: Number(form.budget) || 0,
        status: "open",
      };
      const { data, error } = await supabase
        .from("transport_requests")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      toast({ title: "Request posted", description: "Drivers nearby will see your request." });
      navigate(`/customer/request/${data.id}`);
    } catch (err) {
      toast({ title: "Could not post request", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 pb-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold tracking-tight mb-1">New transport request</h1>
      <p className="text-sm text-muted-foreground mb-6">Tell drivers what you need moved and get competitive quotes.</p>

      <form onSubmit={submit} className="space-y-5">
        <div className="bg-white rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Locations</h2>
          <div className="space-y-2">
            <Label htmlFor="pickup">Pickup location</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
              <Input id="pickup" placeholder="e.g. Avondale, Harare" value={form.pickup_location} onChange={(e) => set("pickup_location", e.target.value)} className="pl-10" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dest">Destination</Label>
            <div className="relative">
              <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="dest" placeholder="e.g. Gweru CBD" value={form.destination} onChange={(e) => set("destination", e.target.value)} className="pl-10" required />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Package className="w-4 h-4 text-primary" /> Cargo details</h2>
          <div>
            <Label className="mb-2 block">Cargo type</Label>
            <div className="grid grid-cols-3 gap-2">
              {CARGO_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => set("cargo_type", t)}
                  className={cn("rounded-xl border-2 px-2 py-2.5 text-center transition-all",
                    form.cargo_type === t ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                  <span className="text-lg block leading-none mb-1">
                    {t === "Furniture" ? "🛋️" : t === "Building Materials" ? "🧱" : t === "Groceries" ? "🛒" : t === "Farm Produce" ? "🌾" : t === "Parcels" ? "📦" : "📦"}
                  </span>
                  <span className="text-[11px] font-medium leading-tight">{t}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="weight">Weight (optional)</Label>
              <Input id="weight" placeholder="e.g. 500kg" value={form.cargo_weight} onChange={(e) => set("cargo_weight", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">Describe your cargo</Label>
            <Textarea id="desc" placeholder="e.g. Two-seater sofa, a coffee table and 4 boxes of clothes" value={form.cargo_description} onChange={(e) => set("cargo_description", e.target.value)} rows={3} required />
          </div>
          <div className="space-y-2">
            <Label>Photos (up to 5)</Label>
            <PhotoUpload value={photos} onChange={setPhotos} max={5} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Timing & budget</h2>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => set("timing", "now")}
              className={cn("rounded-xl border-2 p-3 text-left transition-all", form.timing === "now" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
              <Zap className="w-4 h-4 text-primary mb-1" />
              <p className="text-sm font-semibold">Now</p>
              <p className="text-[11px] text-muted-foreground">As soon as possible</p>
            </button>
            <button type="button" onClick={() => set("timing", "scheduled")}
              className={cn("rounded-xl border-2 p-3 text-left transition-all", form.timing === "scheduled" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
              <Calendar className="w-4 h-4 text-primary mb-1" />
              <p className="text-sm font-semibold">Schedule</p>
              <p className="text-[11px] text-muted-foreground">Pick a date & time</p>
            </button>
          </div>
          {form.timing === "scheduled" && (
            <div className="space-y-2">
              <Label htmlFor="sched">When do you need it?</Label>
              <Input id="sched" type="datetime-local" value={form.scheduled_date} onChange={(e) => set("scheduled_date", e.target.value)} required />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="budget">Your suggested budget (USD)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="budget" type="number" min="0" step="1" placeholder="e.g. 50" value={form.budget} onChange={(e) => set("budget", e.target.value)} className="pl-10" required />
            </div>
            <p className="text-xs text-muted-foreground">Drivers will quote around your budget — you pick the best offer.</p>
          </div>
        </div>

        <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading}>
          {loading ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" />Posting...</>) : "Post request & get quotes"}
        </Button>
      </form>
    </div>
  );
}