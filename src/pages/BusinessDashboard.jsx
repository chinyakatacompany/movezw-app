import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import {
  Package, CheckCircle2, Gauge, DollarSign, Truck, Users, Wrench, Plus, X, Building2, TrendingUp,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import PageHeader from "@/components/shared/PageHeader";
import KPICard from "@/components/shared/KPICard";
import DataTable from "@/components/shared/DataTable";
import { LoadingScreen, ErrorState } from "@/components/shared/Loaders";
import { StatusBadge, formatDate, formatMoney, VEHICLE_TYPES, VEHICLE_ICONS } from "@/lib/movezw";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const NAVY = "#1e2f5e";

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

function VehicleBadge({ status }) {
  const map = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    in_maintenance: "bg-amber-50 text-amber-700 border-amber-200",
    retired: "bg-muted text-muted-foreground border-border",
  };
  return <span className={cn("text-xs font-semibold px-2 py-1 rounded-full border capitalize whitespace-nowrap", map[status] || map.active)}>{(status || "active").replace("_", " ")}</span>;
}

function dayKey(d) { return d.toISOString().slice(0, 10); }

export default function BusinessDashboard() {
  const { user } = useAuth();
  const [business, setBusiness] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vForm, setVForm] = useState({ vehicle_type: "Pickup", plate_number: "", model: "", capacity_kg: "" });
  const [dForm, setDForm] = useState({ full_name: "", phone: "", vehicle_type: "Pickup", location_area: "" });

  const loadAll = async (bizId) => {
    const [{ data: d, error: dErr }, { data: v, error: vErr }] = await Promise.all([
      supabase.from("driver_profiles").select("*").eq("business_id", bizId).order("created_at", { ascending: false }).limit(200),
      supabase.from("fleet_vehicles").select("*").eq("business_id", bizId).order("created_at", { ascending: false }).limit(200),
    ]);
    if (dErr) console.error("Failed to load drivers:", dErr);
    if (vErr) console.error("Failed to load vehicles:", vErr);
    setDrivers(d || []);
    setVehicles(v || []);
    const driverUserIds = (d || []).map((x) => x.user_id).filter(Boolean);
    if (driverUserIds.length) {
      const { data: j, error: jErr } = await supabase
        .from("transport_requests")
        .select("*")
        .in("accepted_driver_id", driverUserIds)
        .order("created_at", { ascending: false })
        .limit(100);
      if (jErr) console.error("Failed to load fleet jobs:", jErr);
      setJobs(j || []);
    } else {
      setJobs([]);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: biz, error: bizErr } = await supabase
          .from("businesses")
          .select("*")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (bizErr) throw bizErr;
        if (!active) return;
        const b = biz?.[0] || null;
        setBusiness(b);
        if (b) await loadAll(b.id);
      } catch {
        setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.id]);

  const activeJobs = jobs.filter((j) => ["confirmed", "en_route_pickup", "collected", "in_transit", "delivered"].includes(j.status)).length;
  const completed = jobs.filter((j) => j.status === "completed").length;
  const earnings = jobs.filter((j) => j.status === "completed").reduce((s, j) => s + (j.accepted_price || 0), 0);
  const activeVehicles = vehicles.filter((v) => v.status === "active").length;
  const utilization = vehicles.length ? Math.round((activeVehicles / vehicles.length) * 100) : 0;

  const maintenanceSoon = vehicles.filter((v) => {
    if (v.status !== "in_maintenance" && v.next_maintenance_date) {
      return (new Date(v.next_maintenance_date).getTime() - Date.now()) < 14 * 86400000;
    }
    return v.status === "in_maintenance";
  });

  const series = useMemo(() => {
    const days = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push(d); }
    const byDay = {};
    jobs.forEach((j) => { const k = j.created_at ? dayKey(new Date(j.created_at)) : null; if (k) byDay[k] = (byDay[k] || 0) + 1; });
    return days.map((d) => ({ date: dayKey(d).slice(5), deliveries: byDay[dayKey(d)] || 0 }));
  }, [jobs]);

  const addVehicle = async (e) => {
    e.preventDefault();
    if (!vForm.plate_number) return;
    setSaving(true);
    try {
      const { data: created, error } = await supabase
        .from("fleet_vehicles")
        .insert({
          business_id: business.id,
          vehicle_type: vForm.vehicle_type,
          plate_number: vForm.plate_number,
          model: vForm.model || undefined,
          capacity_kg: Number(vForm.capacity_kg) || undefined,
          status: "active",
        })
        .select()
        .single();
      if (error) throw error;
      setVehicles((p) => [created, ...p]);
      setShowAddVehicle(false);
      setVForm({ vehicle_type: "Pickup", plate_number: "", model: "", capacity_kg: "" });
      toast({ title: "Vehicle added to fleet" });
    } catch (err) {
      toast({ title: "Could not add vehicle", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addDriver = async (e) => {
    e.preventDefault();
    if (!dForm.full_name) return;
    setSaving(true);
    try {
      const { data: created, error } = await supabase
        .from("driver_profiles")
        .insert({
          // Roster drivers who haven't signed up yet don't have a real auth
          // account; a random placeholder id keeps the column's uuid type happy
          // and will simply never match a real accepted_driver_id on a job.
          user_id: crypto.randomUUID(),
          business_id: business.id,
          full_name: dForm.full_name,
          phone: dForm.phone || undefined,
          vehicle_type: dForm.vehicle_type,
          location_area: dForm.location_area || undefined,
          verification_status: "pending",
        })
        .select()
        .single();
      if (error) throw error;
      setDrivers((p) => [created, ...p]);
      setShowAddDriver(false);
      setDForm({ full_name: "", phone: "", vehicle_type: "Pickup", location_area: "" });
      toast({ title: "Driver added to roster", description: "They'll appear once verified by admin." });
    } catch (err) {
      toast({ title: "Could not add driver", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const assignDriver = async (vehicle, driverProfileId) => {
    const drv = drivers.find((d) => d.id === driverProfileId);
    try {
      const { data: updated, error } = await supabase
        .from("fleet_vehicles")
        .update({
          assigned_driver_profile_id: driverProfileId || null,
          assigned_driver_name: drv?.full_name || null,
        })
        .eq("id", vehicle.id)
        .select()
        .single();
      if (error) throw error;
      setVehicles((p) => p.map((v) => (v.id === vehicle.id ? updated : v)));
      toast({ title: drv ? `Assigned ${drv.full_name}` : "Driver unassigned" });
    } catch {
      toast({ title: "Could not assign driver", variant: "destructive" });
    }
  };

  const toggleMaintenance = async (vehicle) => {
    const next = vehicle.status === "in_maintenance" ? "active" : "in_maintenance";
    try {
      const { data: updated, error } = await supabase
        .from("fleet_vehicles")
        .update({
          status: next,
          last_maintenance_date: next === "in_maintenance" ? new Date().toISOString() : vehicle.last_maintenance_date,
        })
        .eq("id", vehicle.id)
        .select()
        .single();
      if (error) throw error;
      setVehicles((p) => p.map((v) => (v.id === vehicle.id ? updated : v)));
      toast({ title: next === "in_maintenance" ? "Marked for maintenance" : "Back in service" });
    } catch {
      toast({ title: "Could not update vehicle", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <PageHeader title="Fleet Dashboard" subtitle="Loading your business…" icon={Building2} />
        <LoadingScreen label="Loading fleet data…" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <ErrorState message="We couldn't load your business data. Please try again." onRetry={() => window.location.reload()} />
      </div>
    );
  }
  if (!business) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <div className="bg-card rounded-2xl border border-border p-8 text-center card-shadow animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-semibold">No business account yet</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-5 max-w-sm mx-auto">Register your company to manage drivers, vehicles, and deliveries from one dashboard.</p>
          <Link to="/business/onboarding"><Button className="h-11 px-6">Set up business account</Button></Link>
        </div>
      </div>
    );
  }

  const vehicleColumns = [
    { key: "plate_number", header: "Plate", sortable: true, render: (v) => <span className="font-semibold">{v.plate_number}</span> },
    {
      key: "vehicle_type", header: "Vehicle", sortable: true,
      render: (v) => <span className="inline-flex items-center gap-1.5"><span>{VEHICLE_ICONS[v.vehicle_type]}</span>{v.vehicle_type}</span>,
    },
    { key: "model", header: "Model", render: (v) => v.model || "—" },
    { key: "capacity_kg", header: "Capacity", sortable: true, render: (v) => v.capacity_kg ? `${v.capacity_kg} kg` : "—" },
    {
      key: "assigned_driver_name", header: "Driver",
      render: (v) => (
        <select
          value={v.assigned_driver_profile_id || ""}
          onChange={(e) => assignDriver(v, e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-w-[140px]"
        >
          <option value="">{v.assigned_driver_name || "Unassigned"}</option>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
        </select>
      ),
    },
    { key: "status", header: "Status", render: (v) => <VehicleBadge status={v.status} /> },
    {
      key: "actions", header: "",
      render: (v) => (
        <button onClick={() => toggleMaintenance(v)} className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted">
          {v.status === "in_maintenance" ? "Reinstate" : "Service"}
        </button>
      ),
    },
  ];

  const driverColumns = [
    { key: "full_name", header: "Name", sortable: true, render: (d) => <span className="font-medium">{d.full_name}</span> },
    { key: "phone", header: "Phone", render: (d) => d.phone || "—" },
    { key: "vehicle_type", header: "Vehicle", render: (d) => <span className="inline-flex items-center gap-1"><span>{VEHICLE_ICONS[d.vehicle_type]}</span>{d.vehicle_type}</span> },
    { key: "rating_avg", header: "Rating", sortable: true, render: (d) => d.rating_avg ? d.rating_avg.toFixed(1) : "—" },
    { key: "completed_jobs", header: "Jobs", sortable: true },
    { key: "verification_status", header: "Status", render: (d) => <VehicleBadge status={d.verification_status} /> },
  ];

  const deliveryColumns = [
    { key: "cargo_type", header: "Job", render: (j) => (
      <div className="min-w-0"><p className="font-medium truncate">{j.cargo_type} · {j.pickup_location} → {j.destination}</p><p className="text-xs text-muted-foreground">{j.customer_name || "Customer"}</p></div>
    ) },
    { key: "status", header: "Status", render: (j) => <StatusBadge status={j.status} /> },
    { key: "accepted_price", header: "Amount", sortable: true, render: (j) => <span className="font-semibold text-primary">{formatMoney(j.accepted_price || j.budget)}</span> },
    { key: "created_at", header: "Date", sortable: true, render: (j) => <span className="text-xs text-muted-foreground">{formatDate(j.created_at)}</span> },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={business.company_name}
        subtitle={`${business.industry} · Fleet management dashboard`}
        icon={Building2}
        actions={<Link to="/business/onboarding"><Button variant="outline" size="sm">Company settings</Button></Link>}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <KPICard icon={Package} label="Active jobs" value={activeJobs} tone="primary" trend={activeJobs ? 12 : 0} />
        <KPICard icon={CheckCircle2} label="Completed deliveries" value={completed} tone="emerald" trend={completed ? 8 : 0} />
        <KPICard icon={Gauge} label="Fleet utilization" value={`${utilization}%`} tone="accent" sub={`${activeVehicles} of ${vehicles.length} active`} />
        <KPICard icon={DollarSign} label="Earnings" value={formatMoney(earnings)} tone="emerald" sub="completed deliveries" />
        <KPICard icon={Truck} label="Vehicles" value={vehicles.length} tone="primary" sub={`${maintenanceSoon.length} need service`} />
        <KPICard icon={Users} label="Drivers" value={drivers.length} tone="accent" sub={`${drivers.filter((d) => d.verification_status === "approved").length} verified`} />
      </div>

      {/* Analytics */}
      <div className="bg-card rounded-2xl border border-border p-5 card-shadow animate-fade-in">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold">Fleet deliveries</h2>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </div>
        </div>
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gFleet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={NAVY} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={NAVY} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval={4} />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Area type="monotone" dataKey="deliveries" stroke={NAVY} strokeWidth={2.5} fill="url(#gFleet)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Maintenance reminders */}
      {maintenanceSoon.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="w-5 h-5 text-amber-600" />
            <h2 className="text-base font-semibold text-amber-900">Maintenance reminders</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {maintenanceSoon.map((v) => (
              <div key={v.id} className="bg-white rounded-xl border border-amber-200 p-3 flex items-center gap-3">
                <span className="text-xl">{VEHICLE_ICONS[v.vehicle_type]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{v.plate_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {v.status === "in_maintenance" ? "Currently in service" : v.next_maintenance_date ? `Service due ${formatDate(v.next_maintenance_date)}` : ""}
                  </p>
                </div>
                <button onClick={() => toggleMaintenance(v)} className="text-xs font-semibold text-amber-700 hover:underline">
                  {v.status === "in_maintenance" ? "Reinstate" : "Mark serviced"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vehicles */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Fleet vehicles</h2>
          <Button size="sm" onClick={() => setShowAddVehicle(true)}><Plus className="w-4 h-4" /> Add vehicle</Button>
        </div>
        <DataTable
          columns={vehicleColumns}
          data={vehicles}
          loading={false}
          searchKeys={["plate_number", "model", "vehicle_type", "assigned_driver_name"]}
          emptyTitle="No vehicles yet"
          emptySubtitle="Add your first vehicle to start managing your fleet."
          emptyIcon={Truck}
        />
      </div>

      {/* Drivers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Drivers & employees</h2>
          <Button size="sm" variant="outline" onClick={() => setShowAddDriver(true)}><Plus className="w-4 h-4" /> Add driver</Button>
        </div>
        <DataTable
          columns={driverColumns}
          data={drivers}
          loading={false}
          searchKeys={["full_name", "phone", "vehicle_type", "location_area"]}
          emptyTitle="No drivers in your fleet"
          emptySubtitle="Add drivers to your roster, or have them join via driver onboarding."
          emptyIcon={Users}
        />
      </div>

      {/* Recent deliveries */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent deliveries</h2>
        </div>
        <DataTable
          columns={deliveryColumns}
          data={jobs}
          loading={false}
          searchKeys={["cargo_type", "pickup_location", "destination", "customer_name"]}
          emptyTitle="No deliveries yet"
          emptySubtitle="Deliveries completed by your drivers will appear here."
          emptyIcon={Package}
        />
      </div>

      {/* Add vehicle modal */}
      <Modal open={showAddVehicle} onClose={() => setShowAddVehicle(false)} title="Add vehicle">
        <form onSubmit={addVehicle} className="space-y-3">
          <div className="space-y-2">
            <Label>Vehicle type</Label>
            <select value={vForm.vehicle_type} onChange={(e) => setVForm((f) => ({ ...f, vehicle_type: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {VEHICLE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-2"><Label>Plate number</Label><Input required value={vForm.plate_number} onChange={(e) => setVForm((f) => ({ ...f, plate_number: e.target.value }))} placeholder="ABCD 123" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Model</Label><Input value={vForm.model} onChange={(e) => setVForm((f) => ({ ...f, model: e.target.value }))} placeholder="Isuzu NPR" /></div>
            <div className="space-y-2"><Label>Capacity (kg)</Label><Input type="number" value={vForm.capacity_kg} onChange={(e) => setVForm((f) => ({ ...f, capacity_kg: e.target.value }))} placeholder="1500" /></div>
          </div>
          <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving…" : "Add to fleet"}</Button>
        </form>
      </Modal>

      {/* Add driver modal */}
      <Modal open={showAddDriver} onClose={() => setShowAddDriver(false)} title="Add driver">
        <form onSubmit={addDriver} className="space-y-3">
          <div className="space-y-2"><Label>Full name</Label><Input required value={dForm.full_name} onChange={(e) => setDForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Tendai Moyo" /></div>
          <div className="space-y-2"><Label>Phone</Label><Input value={dForm.phone} onChange={(e) => setDForm((f) => ({ ...f, phone: e.target.value }))} placeholder="0772 123 456" /></div>
          <div className="space-y-2">
            <Label>Vehicle type</Label>
            <select value={dForm.vehicle_type} onChange={(e) => setDForm((f) => ({ ...f, vehicle_type: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {VEHICLE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-2"><Label>Operating area</Label><Input value={dForm.location_area} onChange={(e) => setDForm((f) => ({ ...f, location_area: e.target.value }))} placeholder="Harare" /></div>
          <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving…" : "Add to roster"}</Button>
        </form>
      </Modal>
    </div>
  );
}
