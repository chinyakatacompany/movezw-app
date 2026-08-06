import React, { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Plus, Calendar, Truck, X, Loader2, Package, Check, Repeat, ArrowRight } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import { LoadingScreen, ErrorState } from "@/components/shared/Loaders";
import { EmptyState, VEHICLE_TYPES, VEHICLE_ICONS, formatMoney, formatDate, createNotification } from "@/lib/movezw";
import { notifyMatchingCustomersForReturnLoad } from "@/lib/matching";
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

function LoadBadge({ status }) {
  const map = {
    open: "bg-emerald-50 text-emerald-700 border-emerald-200",
    booked: "bg-blue-50 text-blue-700 border-blue-200",
    closed: "bg-muted text-muted-foreground border-border",
    cancelled: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return <span className={cn("text-xs font-semibold px-2 py-1 rounded-full border capitalize", map[status] || map.open)}>{status}</span>;
}

export default function DriverReturnLoads() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loads, setLoads] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ origin: "", destination: "", departure_date: "", vehicle_type: "Pickup", available_capacity_kg: "", price: "", cargo_notes: "" });

  const loadAll = async () => {
    const [{ data: myLoads }, { data: myBookings }] = await Promise.all([
      supabase.from("return_loads").select("*").eq("driver_id", user.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("return_load_bookings").select("*").eq("driver_id", user.id).order("created_at", { ascending: false }).limit(200),
    ]);
    setLoads(myLoads || []);
    setBookings(myBookings || []);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: profiles } = await supabase
          .from("driver_profiles")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (!active) return;
        const p = profiles?.[0] || null;
        setProfile(p);
        if (p) setForm((f) => ({ ...f, vehicle_type: p.vehicle_type || "Pickup" }));
        await loadAll();
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.id]);

  const createLoad = async (e) => {
    e.preventDefault();
    if (!form.origin || !form.destination || !form.departure_date || !form.available_capacity_kg || !form.price) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("return_loads").insert({
        driver_id: user.id,
        driver_profile_id: profile?.id || undefined,
        driver_name: profile?.full_name || user.full_name || "Driver",
        driver_photo_url: profile?.profile_picture_url || undefined,
        verified: profile?.verification_status === "approved",
        vehicle_type: form.vehicle_type,
        origin: form.origin,
        destination: form.destination,
        departure_date: new Date(form.departure_date).toISOString(),
        available_capacity_kg: Number(form.available_capacity_kg),
        price: Number(form.price),
        cargo_notes: form.cargo_notes || undefined,
        status: "open",
      });
      if (error) throw error;
      try {
        await notifyMatchingCustomersForReturnLoad({ origin: form.origin, destination: form.destination, price: Number(form.price) });
      } catch (e) {
        console.error("Failed to notify matching customers:", e);
      }
      setShowCreate(false);
      setForm({ origin: "", destination: "", departure_date: "", vehicle_type: profile?.vehicle_type || "Pickup", available_capacity_kg: "", price: "", cargo_notes: "" });
      await loadAll();
      toast({ title: "Return load listed", description: "Customers can now book your space." });
    } catch (err) {
      toast({ title: "Could not list load", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const acceptBooking = async (booking) => {
    const load = loads.find((l) => l.id === booking.return_load_id);
    if (!load) return;
    try {
      const others = bookings.filter((b) => b.return_load_id === load.id && b.status === "pending" && b.id !== booking.id);
      const { error: bookErr } = await supabase.from("return_load_bookings").update({ status: "accepted" }).eq("id", booking.id);
      if (bookErr) throw bookErr;
      const { error: loadErr } = await supabase
        .from("return_loads")
        .update({
          status: "booked",
          accepted_booking_id: booking.id,
          accepted_customer_id: booking.customer_id,
          accepted_customer_name: booking.customer_name,
        })
        .eq("id", load.id);
      if (loadErr) throw loadErr;
      if (others.length) {
        await supabase.from("return_load_bookings").update({ status: "rejected" }).eq("return_load_id", load.id).eq("status", "pending");
        others.forEach((b) =>
          createNotification(b.customer_id, "offer_rejected", "Return load booking declined", `Your booking for ${load.origin} → ${load.destination} was declined.`, "/return-loads")
        );
      }
      await createNotification(booking.customer_id, "offer_accepted", "Return load booking accepted", `Your booking for ${load.origin} → ${load.destination} was accepted by the driver.`, "/return-loads");
      await loadAll();
      toast({ title: "Booking accepted", description: "Other pending requests were declined." });
    } catch (err) {
      toast({ title: "Could not accept booking", description: err.message, variant: "destructive" });
    }
  };

  const rejectBooking = async (booking) => {
    const load = loads.find((l) => l.id === booking.return_load_id);
    try {
      const { error } = await supabase.from("return_load_bookings").update({ status: "rejected" }).eq("id", booking.id);
      if (error) throw error;
      if (load) {
        await createNotification(booking.customer_id, "offer_rejected", "Return load booking declined", `Your booking for ${load.origin} → ${load.destination} was declined.`, "/return-loads");
      }
      await loadAll();
      toast({ title: "Booking declined" });
    } catch (err) {
      toast({ title: "Could not update booking", description: err.message, variant: "destructive" });
    }
  };

  const closeLoad = async (load) => {
    try {
      const { error } = await supabase.from("return_loads").update({ status: "closed" }).eq("id", load.id);
      if (error) throw error;
      await loadAll();
      toast({ title: "Listing closed" });
    } catch {
      toast({ title: "Could not close listing", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <PageHeader title="My Return Loads" subtitle="Manage your return trip listings" icon={Repeat} />
        <LoadingScreen label="Loading…" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <ErrorState message="We couldn't load your listings. Please try again." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const pendingBookings = bookings.filter((b) => b.status === "pending");

  const loadColumns = [
    {
      key: "route", header: "Route",
      render: (l) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium"><span className="truncate">{l.origin}</span><ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /><span className="truncate">{l.destination}</span></div>
          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Calendar className="w-3 h-3" />{formatDate(l.departure_date)}</div>
        </div>
      ),
    },
    { key: "vehicle_type", header: "Vehicle", render: (l) => <span className="inline-flex items-center gap-1"><span>{VEHICLE_ICONS[l.vehicle_type]}</span>{l.vehicle_type}</span> },
    { key: "available_capacity_kg", header: "Space", sortable: true, render: (l) => `${l.available_capacity_kg} kg` },
    { key: "price", header: "Price", sortable: true, render: (l) => <span className="font-semibold text-primary">{formatMoney(l.price)}</span> },
    { key: "status", header: "Status", render: (l) => <LoadBadge status={l.status} /> },
    {
      key: "actions", header: "",
      render: (l) => l.status === "open" ? (
        <button onClick={() => closeLoad(l)} className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted">Close</button>
      ) : null,
    },
  ];

  const bookingColumns = [
    {
      key: "route", header: "Load",
      render: (b) => {
        const l = loads.find((x) => x.id === b.return_load_id);
        return <div className="min-w-0"><p className="text-sm font-medium truncate">{l ? `${l.origin} → ${l.destination}` : "—"}</p><p className="text-xs text-muted-foreground">{b.customer_name}</p></div>;
      },
    },
    { key: "requested_capacity_kg", header: "Requested", sortable: true, render: (b) => `${b.requested_capacity_kg} kg` },
    { key: "offered_price", header: "Offer", sortable: true, render: (b) => <span className="font-semibold text-primary">{formatMoney(b.offered_price)}</span> },
    { key: "cargo_description", header: "Cargo", render: (b) => b.cargo_description || "—" },
    {
      key: "actions", header: "",
      render: (b) => b.status === "pending" ? (
        <div className="flex items-center gap-1">
          <button onClick={() => acceptBooking(b)} className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center" aria-label="Accept"><Check className="w-4 h-4" /></button>
          <button onClick={() => rejectBooking(b)} className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center" aria-label="Reject"><X className="w-4 h-4" /></button>
        </div>
      ) : <span className="text-xs text-muted-foreground capitalize">{b.status}</span>,
    },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <PageHeader
        title="My Return Loads"
        subtitle="List empty return-trip space and manage booking requests."
        icon={Repeat}
        actions={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> New listing</Button>}
      />

      <div className="space-y-3">
        <h2 className="text-base font-semibold">Pending booking requests {pendingBookings.length > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">({pendingBookings.length})</span>}</h2>
        {pendingBookings.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border card-shadow">
            <EmptyState icon={Package} title="No pending requests" subtitle="Booking requests for your return loads will appear here." />
          </div>
        ) : (
          <DataTable columns={bookingColumns} data={pendingBookings} searchKeys={["customer_name", "cargo_description"]} pageSize={6} emptyTitle="No pending requests" emptyIcon={Package} />
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold">Your listings</h2>
        <DataTable
          columns={loadColumns}
          data={loads}
          searchKeys={["origin", "destination", "vehicle_type"]}
          pageSize={6}
          emptyTitle="No return loads listed"
          emptySubtitle="Create a listing to advertise empty cargo space on your next return trip."
          emptyIcon={Truck}
        />
      </div>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="List a return load">
        <form onSubmit={createLoad} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Returning from</Label><Input required value={form.origin} onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value }))} placeholder="Mutare" /></div>
            <div className="space-y-2"><Label>Returning to</Label><Input required value={form.destination} onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))} placeholder="Harare" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Departure date</Label><Input type="date" required value={form.departure_date} onChange={(e) => setForm((f) => ({ ...f, departure_date: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Vehicle type</Label>
              <select value={form.vehicle_type} onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                {VEHICLE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Available space (kg)</Label><Input type="number" required value={form.available_capacity_kg} onChange={(e) => setForm((f) => ({ ...f, available_capacity_kg: e.target.value }))} placeholder="1500" /></div>
            <div className="space-y-2"><Label>Price (USD)</Label><Input type="number" required value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="120" /></div>
          </div>
          <div className="space-y-2"><Label>Cargo notes (optional)</Label><Input value={form.cargo_notes} onChange={(e) => setForm((f) => ({ ...f, cargo_notes: e.target.value }))} placeholder="e.g. No perishables" /></div>
          <Button type="submit" className="w-full" disabled={saving}>{saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Listing…</> : "List return load"}</Button>
        </form>
      </Modal>
    </div>
  );
}
