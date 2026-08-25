import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Search, SlidersHorizontal, MapPin, Calendar, Repeat, BadgeCheck, X, Truck, ArrowRight, Loader2, Package, Check } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { LoadingScreen, ErrorState } from "@/components/shared/Loaders";
import { EmptyState, StarRating, VEHICLE_TYPES, VEHICLE_ICONS, CARGO_TYPES, formatMoney, formatDateTime, createNotification } from "@/lib/movezw";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl card-shadow-lg p-5 w-full max-w-md animate-rise">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function emptyBookingForm() {
  return {
    pickup_location: "", destination: "", pickup_date: "", pickup_time: "",
    cargo_type: CARGO_TYPES[0], requested_capacity_kg: "", offered_price: "",
    cargo_description: "", message: "",
  };
}

// Splits a timestamp into separate <input type="date">/<input type="time">
// values in local time, so the booking form can default the customer's
// requested pickup to the driver's own departure — usually exactly when
// cargo needs to be ready — while staying editable if their actual pickup
// point or timing differs.
function splitDateTime(iso) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const local = new Date(d - d.getTimezoneOffset() * 60000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

export default function ReturnMarketplace() {
  const { user } = useAuth();
  const [loads, setLoads] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState({ origin: "", destination: "", date: "", vehicleType: "", minCapacity: "", maxPrice: "" });
  const [sort, setSort] = useState("departure_date");
  const [showFilters, setShowFilters] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [booking, setBooking] = useState(null);
  const [bForm, setBForm] = useState(emptyBookingForm());
  const [submitting, setSubmitting] = useState(false);

  // Only trust the hint if it's tagged for this exact account — see
  // RoleGuard.jsx for why (sessionStorage isn't cleared on logout).
  const isDriver = user?.role === "driver"
    || (sessionStorage.getItem("movzw_signup_user_id") === user?.id && sessionStorage.getItem("movzw_signup_role") === "driver");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: open, error: loadErr } = await supabase
          .from("return_loads")
          .select("*")
          .eq("status", "open")
          .order("departure_date", { ascending: true })
          .limit(200);
        if (loadErr) throw loadErr;
        if (!active) return;
        setLoads(open || []);
        const profileIds = [...new Set((open || []).map((l) => l.driver_profile_id).filter(Boolean))];
        const pMap = {};
        if (profileIds.length) {
          const { data: ps } = await supabase.rpc("fn_driver_public_profiles").in("id", profileIds).limit(200);
          (ps || []).forEach((p) => { pMap[p.id] = p; });
        }
        if (active) setProfiles(pMap);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    let arr = [...loads];
    const f = filters;
    if (f.origin.trim()) arr = arr.filter((l) => l.origin?.toLowerCase().includes(f.origin.toLowerCase()));
    if (f.destination.trim()) arr = arr.filter((l) => l.destination?.toLowerCase().includes(f.destination.toLowerCase()));
    if (f.vehicleType) arr = arr.filter((l) => l.vehicle_type === f.vehicleType);
    if (f.date) arr = arr.filter((l) => l.departure_date && l.departure_date.slice(0, 10) === f.date);
    if (f.minCapacity) arr = arr.filter((l) => (l.available_capacity_kg || 0) >= Number(f.minCapacity));
    if (f.maxPrice) arr = arr.filter((l) => (l.price || 0) <= Number(f.maxPrice));
    arr.sort((a, b) => {
      if (sort === "price") return (a.price || 0) - (b.price || 0);
      if (sort === "capacity") return (b.available_capacity_kg || 0) - (a.available_capacity_kg || 0);
      return new Date(a.departure_date) - new Date(b.departure_date);
    });
    return arr;
  }, [loads, filters, sort]);

  // "Book space" asks first, rather than dropping the customer straight into
  // a multi-field form — only on "Yes" do we ask for the actual pickup
  // details, pre-filled from the driver's own route/departure/price so it's
  // still just a few edits, not a blank form.
  const openBooking = (load) => setConfirming(load);

  const confirmInterested = () => {
    const load = confirming;
    setConfirming(null);
    const { date, time } = splitDateTime(load.departure_date);
    setBooking(load);
    setBForm({ ...emptyBookingForm(), pickup_location: load.origin, destination: load.destination, pickup_date: date, pickup_time: time, offered_price: String(load.price || "") });
  };

  const submitBooking = async (e) => {
    e.preventDefault();
    if (!bForm.pickup_location || !bForm.destination || !bForm.pickup_date || !bForm.pickup_time || !bForm.cargo_type || !bForm.requested_capacity_kg || !bForm.offered_price) return;
    if (Number(bForm.requested_capacity_kg) > booking.available_capacity_kg) {
      toast({ title: "Requested capacity exceeds available space", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("return_load_bookings").insert({
        return_load_id: booking.id,
        driver_id: booking.driver_id,
        customer_id: user.id,
        customer_name: user.full_name || user.email,
        pickup_location: bForm.pickup_location,
        destination: bForm.destination,
        pickup_time: new Date(`${bForm.pickup_date}T${bForm.pickup_time}`).toISOString(),
        cargo_type: bForm.cargo_type,
        requested_capacity_kg: Number(bForm.requested_capacity_kg),
        offered_price: Number(bForm.offered_price),
        cargo_description: bForm.cargo_description || undefined,
        message: bForm.message || undefined,
        status: "pending",
      });
      if (error) throw error;
      await createNotification(
        booking.driver_id, "new_offer",
        "New return load booking request",
        `${user.full_name || "A customer"} requested space on your ${booking.origin} → ${booking.destination} return trip.`,
        "/return-loads/manage"
      );
      setBooking(null);
      toast({ title: "Booking request sent", description: "The driver will review your request." });
    } catch (err) {
      toast({ title: "Could not send request", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <PageHeader title="Return Load Marketplace" subtitle="Find empty cargo space on return trips" icon={Repeat} />
        <LoadingScreen label="Loading available loads…" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <ErrorState message="We couldn't load the marketplace. Please try again." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
      <PageHeader
        title="Return Load Marketplace"
        subtitle="Book empty cargo space on drivers' return trips — cheaper and greener."
        icon={Repeat}
        actions={isDriver ? <Link to="/return-loads/manage"><Button size="sm" variant="outline">My listings</Button></Link> : null}
      />

      {/* Search + sort */}
      <div className="bg-card rounded-2xl border border-border p-3 card-shadow space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={filters.origin}
              onChange={(e) => setFilters((f) => ({ ...f, origin: e.target.value }))}
              placeholder="Search origin or destination…"
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="icon" onClick={() => setShowFilters((s) => !s)} aria-label="Filters">
            <SlidersHorizontal className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort by</span>
          {[
            { k: "departure_date", l: "Date" },
            { k: "price", l: "Price" },
            { k: "capacity", l: "Capacity" },
          ].map((o) => (
            <button
              key={o.k}
              onClick={() => setSort(o.k)}
              className={cn(
                "text-xs font-medium px-2.5 py-1 rounded-full border transition-colors",
                sort === o.k ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {o.l}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} load{filtered.length === 1 ? "" : "s"}</span>
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 gap-3 pt-1 animate-fade-in">
            <div className="space-y-1">
              <Label className="text-xs">Destination</Label>
              <Input value={filters.destination} onChange={(e) => setFilters((f) => ({ ...f, destination: e.target.value }))} placeholder="e.g. Bulawayo" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Departure date</Label>
              <Input type="date" value={filters.date} onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value }))} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vehicle type</Label>
              <select value={filters.vehicleType} onChange={(e) => setFilters((f) => ({ ...f, vehicleType: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                <option value="">Any</option>
                {VEHICLE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Min kg</Label>
                <Input type="number" value={filters.minCapacity} onChange={(e) => setFilters((f) => ({ ...f, minCapacity: e.target.value }))} placeholder="0" className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max $</Label>
                <Input type="number" value={filters.maxPrice} onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))} placeholder="∞" className="h-9" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Listings */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border card-shadow">
          <EmptyState icon={Package} title="No return loads found" subtitle="Try adjusting your filters, or check back soon as drivers post return trips." />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((load) => {
            const profile = profiles[load.driver_profile_id] || {};
            const rating = profile.rating_avg || load.driver_rating || 0;
            const jobs = profile.completed_jobs ?? load.completed_jobs ?? 0;
            return (
              <div key={load.id} className="bg-card rounded-2xl border border-border card-shadow p-4 animate-fade-in">
                <div className="flex items-start gap-3">
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
                      {(load.verified || profile.verification_status === "approved") && (
                        <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="inline-flex items-center gap-0.5"><StarRating value={rating} /> {rating ? rating.toFixed(1) : "New"}</span>
                      <span>· {jobs} job{jobs === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                  <span className="text-2xl">{VEHICLE_ICONS[load.vehicle_type]}</span>
                </div>

                <div className="mt-3 flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-accent flex-shrink-0" />
                  <span className="font-medium truncate">{load.origin}</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium truncate">{load.destination}</span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {formatDateTime(load.departure_date)}</span>
                  <span className="inline-flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> {load.available_capacity_kg} kg available</span>
                  {load.cargo_notes && <span className="truncate">· {load.cargo_notes}</span>}
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-primary">{formatMoney(load.price)}</p>
                    <p className="text-[11px] text-muted-foreground">for the space</p>
                  </div>
                  <Button size="sm" onClick={() => openBooking(load)}>Book space</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Step 1: quick yes/no before asking for pickup details */}
      <Modal open={!!confirming} onClose={() => setConfirming(null)} title="Book this return trip?">
        {confirming && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-accent flex-shrink-0" />
              <span className="font-medium">{confirming.origin}</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="font-medium">{confirming.destination}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {confirming.driver_name} is heading out {formatDateTime(confirming.departure_date)} with {confirming.available_capacity_kg} kg of space, for {formatMoney(confirming.price)}.
              If you're interested we'll ask for your pickup details next.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirming(null)}>
                <X className="w-4 h-4 mr-1.5" /> No
              </Button>
              <Button type="button" className="flex-1" onClick={confirmInterested}>
                <Check className="w-4 h-4 mr-1.5" /> Yes, I'm interested
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Step 2: pickup details, only reached after "Yes" above */}
      <Modal open={!!booking} onClose={() => setBooking(null)} title="Request to book space">
        {booking && (
          <form onSubmit={submitBooking} className="space-y-3">
            <div className="text-sm text-muted-foreground -mt-1 mb-1">
              Driver's route: {booking.origin} → {booking.destination} · {formatDateTime(booking.departure_date)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Pickup point</Label>
                <Input required value={bForm.pickup_location} onChange={(e) => setBForm((f) => ({ ...f, pickup_location: e.target.value }))} placeholder={booking.origin} />
              </div>
              <div className="space-y-2">
                <Label>Destination</Label>
                <Input required value={bForm.destination} onChange={(e) => setBForm((f) => ({ ...f, destination: e.target.value }))} placeholder={booking.destination} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Pickup date</Label>
                <Input type="date" required value={bForm.pickup_date} onChange={(e) => setBForm((f) => ({ ...f, pickup_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Pickup time</Label>
                <Input type="time" required value={bForm.pickup_time} onChange={(e) => setBForm((f) => ({ ...f, pickup_time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Load type</Label>
              <div className="grid grid-cols-3 gap-2">
                {CARGO_TYPES.map((t) => (
                  <button
                    key={t} type="button" onClick={() => setBForm((f) => ({ ...f, cargo_type: t }))}
                    className={cn(
                      "rounded-xl border-2 px-2 py-2 text-xs font-medium text-center transition-all",
                      bForm.cargo_type === t ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Weight / space needed (kg)</Label>
                <Input type="number" required value={bForm.requested_capacity_kg} onChange={(e) => setBForm((f) => ({ ...f, requested_capacity_kg: e.target.value }))} placeholder={`${booking.available_capacity_kg} max`} />
              </div>
              <div className="space-y-2">
                <Label>Your offer (USD)</Label>
                <Input type="number" required value={bForm.offered_price} onChange={(e) => setBForm((f) => ({ ...f, offered_price: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cargo description (optional)</Label>
              <Input value={bForm.cargo_description} onChange={(e) => setBForm((f) => ({ ...f, cargo_description: e.target.value }))} placeholder="e.g. 5 boxes of groceries" />
            </div>
            <div className="space-y-2">
              <Label>Message (optional)</Label>
              <Input value={bForm.message} onChange={(e) => setBForm((f) => ({ ...f, message: e.target.value }))} placeholder="Any details for the driver" />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</> : "Send booking request"}
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
