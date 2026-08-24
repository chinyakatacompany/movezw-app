import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Navigation, DollarSign, Clock, Calendar, Loader2, Package, Zap, LocateFixed, Minus, Plus, Layers, Map as MapIcon } from "lucide-react";
import PhotoUpload from "@/components/PhotoUpload";
import AddressSearchInput from "@/components/AddressSearchInput";
import { CARGO_TYPES } from "@/lib/movezw";
import { notifyMatchingDriversForRequest, notifyMatchingReturnLoadDriversForRequest, fetchRoadDistanceKm, distanceKm } from "@/lib/matching";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { geolocationUnavailableReason } from "@/lib/geo";

const RouteMap = React.lazy(() => import("@/components/RouteMap"));

// Floor on what a customer can offer, so a driver's trip is never priced
// below what fuel/time on the road is actually worth. Only enforceable when
// both ends are pinned to real coordinates — an address typed without
// picking a suggestion has no distance to check the budget against, so
// submission isn't blocked in that case (best-effort, matches how distance
// is treated elsewhere in this app rather than forcing exact pins).
const MIN_RATE_PER_KM = 0.9;

// Sensible ceiling on how many loads one submit can post — a fat-fingered
// large number would flood the open-jobs feed for every nearby driver with
// near-duplicate postings.
const MAX_LOADS = 10;

// Build the most locally-specific label the free OSM data actually has —
// road + suburb + city — instead of Nominatim's default display_name, which
// tails off into province/country and can bury (or in sparser areas, lose)
// the specific area. Note: OSM only indexes suburb-level areas in Zimbabwe
// (e.g. "Budiriro"), not numbered sections within them (e.g. "Budiriro 5
// West") — that finer detail isn't in the free dataset, so this is the most
// precise text this data source can produce.
function formatReverseAddress(data) {
  const a = data?.address;
  if (!a) return data?.display_name || null;
  const parts = [];
  if (a.road) parts.push(a.road);
  const area = a.suburb || a.neighbourhood || a.quarter || a.village || a.town;
  if (area) parts.push(area);
  if (a.city || a.county) parts.push(a.city || a.county);
  return parts.length > 0 ? parts.join(", ") : data.display_name || null;
}

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
  const [loads, setLoads] = useState(1);
  const [showRouteMap, setShowRouteMap] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pickupCoords, setPickupCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [locating, setLocating] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const useMyLocation = () => {
    const reason = geolocationUnavailableReason();
    if (reason) {
      toast({ title: "Location not available", description: reason, variant: "destructive" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPickupCoords(coords);
        setLocating(false);
        toast({ title: "Location captured", description: "Your exact pickup location has been saved." });
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&zoom=18&addressdetails=1`);
          const data = await res.json();
          const label = formatReverseAddress(data);
          if (label) set("pickup_location", label);
        } catch (_) {
          // Best-effort — keep the GPS coordinates even if we can't resolve an address string.
        }
      },
      (err) => {
        setLocating(false);
        toast({ title: "Could not get location", description: err.message || "Please allow location access and try again.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (pickupCoords && destinationCoords) {
        const roadKm = await fetchRoadDistanceKm(pickupCoords, destinationCoords);
        const tripKm = roadKm ?? distanceKm(pickupCoords.lat, pickupCoords.lng, destinationCoords.lat, destinationCoords.lng);
        if (tripKm) {
          const minBudget = tripKm * MIN_RATE_PER_KM;
          if ((Number(form.budget) || 0) < minBudget) {
            toast({
              title: "Budget too low for this distance",
              description: `This trip is about ${tripKm.toFixed(1)} km — the minimum budget is $${minBudget.toFixed(2)} (${MIN_RATE_PER_KM.toFixed(2)}/km) so drivers can actually afford to take it.`,
              variant: "destructive",
            });
            setLoading(false);
            return;
          }
        }
      }
      const basePayload = {
        customer_id: user.id,
        customer_name: user.full_name || user.email,
        pickup_location: form.pickup_location,
        pickup_lat: pickupCoords?.lat ?? null,
        pickup_lng: pickupCoords?.lng ?? null,
        destination: form.destination,
        destination_lat: destinationCoords?.lat ?? null,
        destination_lng: destinationCoords?.lng ?? null,
        cargo_type: form.cargo_type,
        cargo_weight: form.cargo_weight || null,
        cargo_description: form.cargo_description,
        photos,
        timing: form.timing,
        scheduled_date: form.timing === "scheduled" ? new Date(form.scheduled_date).toISOString() : null,
        // Budget entered is per load — each row in the batch posts at the
        // same price, not the price divided or multiplied.
        budget: Number(form.budget) || 0,
        status: "open",
      };

      // More than one load posts N independent, separately-biddable rows
      // (a different driver can take each one) rather than a single job
      // asking for N loads at once — batch_id just lets the customer's own
      // job list group them as "Load 1 of 2" etc.
      const batchId = loads > 1 ? crypto.randomUUID() : null;
      const rows = Array.from({ length: loads }, (_, i) => ({
        ...basePayload,
        batch_id: batchId,
        batch_index: loads > 1 ? i + 1 : null,
        batch_total: loads > 1 ? loads : null,
      }));

      const { data, error } = await supabase
        .from("transport_requests")
        .insert(rows)
        .select();

      if (error) throw error;

      await Promise.all(
        data.map(async (row) => {
          try { await notifyMatchingDriversForRequest(row); } catch (e) { console.error("Failed to notify drivers:", e); }
          try { await notifyMatchingReturnLoadDriversForRequest(row); } catch (e) { console.error("Failed to notify return-load drivers:", e); }
          try { await supabase.functions.invoke("notify-drivers-push", { body: { requestId: row.id } }); } catch (e) { console.error("Failed to send push alerts:", e); }
        })
      );

      if (loads > 1) {
        toast({ title: `${loads} loads posted`, description: "Drivers nearby will see each one and can bid separately." });
        navigate("/customer");
      } else {
        toast({ title: "Request posted", description: "Drivers nearby will see your request." });
        navigate(`/customer/request/${data[0].id}`);
      }
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
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Locations</h2>
          <div className="space-y-2">
            <Label htmlFor="pickup">Pickup location</Label>
            <AddressSearchInput
              id="pickup"
              icon={MapPin}
              iconClassName="text-primary"
              placeholder="e.g. Avondale, Harare"
              value={form.pickup_location}
              onChange={(text) => { set("pickup_location", text); setPickupCoords(null); }}
              onSelect={({ lat, lng, label }) => { set("pickup_location", label); setPickupCoords({ lat, lng }); }}
              required
            />
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className={cn(
                "flex items-center gap-2 text-sm font-semibold rounded-xl px-3.5 py-2.5 border-2 transition-colors w-full justify-center",
                pickupCoords
                  ? "text-emerald-700 bg-emerald-50 border-emerald-300"
                  : "text-primary bg-primary/10 border-primary/30 hover:bg-primary/15"
              )}
            >
              {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
              {locating ? "Getting your location..." : pickupCoords ? "Exact location captured ✓" : "Use my current location"}
            </button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dest">Destination</Label>
            <AddressSearchInput
              id="dest"
              icon={Navigation}
              placeholder="e.g. Gweru CBD"
              value={form.destination}
              onChange={(text) => { set("destination", text); setDestinationCoords(null); }}
              onSelect={({ lat, lng, label }) => { set("destination", label); setDestinationCoords({ lat, lng }); }}
              required
            />
          </div>
          {pickupCoords && destinationCoords && (
            <>
              <button
                type="button"
                onClick={() => setShowRouteMap((v) => !v)}
                className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-primary/10 border-2 border-primary/30 text-primary font-semibold text-sm hover:bg-primary/15 transition-colors"
              >
                <MapIcon className="w-4 h-4" /> {showRouteMap ? "Hide route map" : "Show route: pickup → destination"}
              </button>
              {showRouteMap && (
                <React.Suspense fallback={<div className="h-[220px] rounded-xl bg-muted animate-pulse" />}>
                  <RouteMap from={pickupCoords} to={destinationCoords} fromLabel="Pickup" toLabel="Destination" height={220} />
                </React.Suspense>
              )}
            </>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
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

        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
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
            <Label className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Number of loads</Label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setLoads((n) => Math.max(1, n - 1))}
                className="w-10 h-10 rounded-xl border-2 border-border flex items-center justify-center text-muted-foreground hover:border-primary/40 disabled:opacity-40"
                disabled={loads <= 1}
                aria-label="Fewer loads"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-lg font-bold w-8 text-center">{loads}</span>
              <button
                type="button"
                onClick={() => setLoads((n) => Math.min(MAX_LOADS, n + 1))}
                className="w-10 h-10 rounded-xl border-2 border-border flex items-center justify-center text-muted-foreground hover:border-primary/40 disabled:opacity-40"
                disabled={loads >= MAX_LOADS}
                aria-label="More loads"
              >
                <Plus className="w-4 h-4" />
              </button>
              <span className="text-xs text-muted-foreground">e.g. 2 truckloads of the same cargo</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget">{loads > 1 ? "Budget per load (USD)" : "Your suggested budget (USD)"}</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="budget" type="number" min="0" step="1" placeholder="e.g. 50" value={form.budget} onChange={(e) => set("budget", e.target.value)} className="pl-10" required />
            </div>
            {loads > 1 ? (
              <p className="text-xs text-accent font-medium">
                This posts {loads} separate requests, each bid on individually by drivers. Total across all loads: ${((Number(form.budget) || 0) * loads).toFixed(2)} (${form.budget || 0} × {loads}).
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Drivers will quote around your budget — you pick the best offer.</p>
            )}
          </div>
        </div>

        <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading}>
          {loading ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" />Posting...</>) : "Post request & get quotes"}
        </Button>
      </form>
    </div>
  );
}