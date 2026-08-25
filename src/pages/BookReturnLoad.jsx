import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Navigation, DollarSign, Clock, Loader2, Package, LocateFixed, BadgeCheck, Truck, Map as MapIcon } from "lucide-react";
import AddressSearchInput from "@/components/AddressSearchInput";
import { LoadingScreen, ErrorState } from "@/components/shared/Loaders";
import { CARGO_TYPES, VEHICLE_ICONS, StarRating, formatMoney, formatDateTime, createNotification } from "@/lib/movezw";
import { geolocationUnavailableReason, formatReverseAddress } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

const RouteMap = React.lazy(() => import("@/components/RouteMap"));

// Splits a timestamp into separate <input type="date">/<input type="time">
// values in local time, so the form can default the customer's requested
// pickup to the driver's own departure — usually exactly when cargo needs
// to be ready — while staying editable if their actual timing differs.
function splitDateTime(iso) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const local = new Date(d - d.getTimezoneOffset() * 60000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

// Same layout/pattern as CreateRequest.jsx (sectioned cards, address
// autocomplete, cargo-type grid) so booking space on a driver's return trip
// feels like the same "post a request" flow customers already know, rather
// than a cut-down popup form.
export default function BookReturnLoad() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [load, setLoad] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showRouteMap, setShowRouteMap] = useState(false);
  const [pickupCoords, setPickupCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [form, setForm] = useState({
    pickup_location: "",
    destination: "",
    cargo_type: CARGO_TYPES[0],
    requested_capacity_kg: "",
    cargo_description: "",
    pickup_date: "",
    pickup_time: "",
    offered_price: "",
    message: "",
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error: loadErr } = await supabase.from("return_loads").select("*").eq("id", id).single();
      if (!active) return;
      if (loadErr || !data) {
        setError(true);
        setLoading(false);
        return;
      }
      setLoad(data);
      const { date, time } = splitDateTime(data.departure_date);
      setForm((f) => ({ ...f, pickup_location: data.origin, destination: data.destination, pickup_date: date, pickup_time: time, offered_price: String(data.price || "") }));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [id]);

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
    if (Number(form.requested_capacity_kg) > load.available_capacity_kg) {
      toast({ title: "Requested weight exceeds available space", description: `This driver only has ${load.available_capacity_kg} kg available.`, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error: insertErr } = await supabase.from("return_load_bookings").insert({
        return_load_id: load.id,
        driver_id: load.driver_id,
        customer_id: user.id,
        customer_name: user.full_name || user.email,
        pickup_location: form.pickup_location,
        pickup_lat: pickupCoords?.lat ?? null,
        pickup_lng: pickupCoords?.lng ?? null,
        destination: form.destination,
        destination_lat: destinationCoords?.lat ?? null,
        destination_lng: destinationCoords?.lng ?? null,
        pickup_time: new Date(`${form.pickup_date}T${form.pickup_time}`).toISOString(),
        cargo_type: form.cargo_type,
        requested_capacity_kg: Number(form.requested_capacity_kg),
        offered_price: Number(form.offered_price),
        cargo_description: form.cargo_description || undefined,
        message: form.message || undefined,
        status: "pending",
      });
      if (insertErr) throw insertErr;
      await createNotification(
        load.driver_id, "new_offer",
        "New return load booking request",
        `${user.full_name || "A customer"} requested space on your ${load.origin} → ${load.destination} return trip.`,
        "/return-loads/manage"
      );
      toast({ title: "Booking request sent", description: "The driver will review your request." });
      navigate("/return-loads");
    } catch (err) {
      toast({ title: "Could not send request", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <LoadingScreen label="Loading…" />
      </div>
    );
  }
  if (error || !load) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <ErrorState message="We couldn't find this return load — it may have been booked or removed." onRetry={() => navigate("/return-loads")} />
      </div>
    );
  }

  return (
    <div className="p-4 pb-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Book return-trip space</h1>
      <p className="text-sm text-muted-foreground mb-6">Tell {load.driver_name.split(" ")[0]} what you need moved on their return trip.</p>

      <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-full bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
          {load.driver_photo_url ? (
            <img src={load.driver_photo_url} alt={load.driver_name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-muted-foreground">{(load.driver_name || "D").charAt(0)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-sm truncate">{load.driver_name}</p>
            {load.verified && <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />}
            <span className="text-lg">{VEHICLE_ICONS[load.vehicle_type]}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{load.origin} → {load.destination} · {formatDateTime(load.departure_date)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-bold text-primary">{formatMoney(load.price)}</p>
          <p className="text-[11px] text-muted-foreground">{load.available_capacity_kg} kg avail.</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Locations</h2>
          <div className="space-y-2">
            <Label htmlFor="pickup">Pickup point</Label>
            <AddressSearchInput
              id="pickup"
              icon={MapPin}
              iconClassName="text-primary"
              placeholder={load.origin}
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
              placeholder={load.destination}
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
            <Label className="mb-2 block">Load type</Label>
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
          <div className="space-y-2">
            <Label htmlFor="weight">Weight / space needed (kg)</Label>
            <Input id="weight" type="number" min="0" required placeholder={`${load.available_capacity_kg} max`} value={form.requested_capacity_kg} onChange={(e) => set("requested_capacity_kg", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">Describe your cargo (optional)</Label>
            <Textarea id="desc" placeholder="e.g. Two-seater sofa, a coffee table and 4 boxes of clothes" value={form.cargo_description} onChange={(e) => set("cargo_description", e.target.value)} rows={3} />
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Timing & offer</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pdate">Pickup date</Label>
              <Input id="pdate" type="date" required value={form.pickup_date} onChange={(e) => set("pickup_date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ptime">Pickup time</Label>
              <Input id="ptime" type="time" required value={form.pickup_time} onChange={(e) => set("pickup_time", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="offer">Your offer (USD)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="offer" type="number" min="0" step="1" value={form.offered_price} onChange={(e) => set("offered_price", e.target.value)} className="pl-10" required />
            </div>
            <p className="text-xs text-muted-foreground">The driver listed this space at {formatMoney(load.price)} — you can offer the same or negotiate.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="msg">Message to driver (optional)</Label>
            <Input id="msg" placeholder="Any details for the driver" value={form.message} onChange={(e) => set("message", e.target.value)} />
          </div>
        </div>

        <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={submitting}>
          {submitting ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" />Sending...</>) : "Send booking request"}
        </Button>
      </form>
    </div>
  );
}
