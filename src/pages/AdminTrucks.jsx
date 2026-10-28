import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Truck, Search, RefreshCw, Loader2, MapPin, BadgeCheck, AlertTriangle } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { bidTonnage } from "@/lib/bidPresentation";
import { truckAvailability, truckMatches, truckTonnageCounts } from "@/lib/adminTrucks";
import { ADMIN_ACTIVE_STATUSES } from "@/lib/adminJobs";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from "recharts";

const labels = { available: "Available", busy: "Busy", offline: "Offline", unavailable: "Unavailable" };
const colours = { available: "bg-emerald-100 text-emerald-800", busy: "bg-amber-100 text-amber-800", offline: "bg-muted text-muted-foreground", unavailable: "bg-red-100 text-red-800" };

// Fetch every page, rather than silently dropping trucks at the API row limit.
async function allRows(makeQuery) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await makeQuery().range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}

export default function AdminTrucks() {
  const [trucks, setTrucks] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("all");
  const [verification, setVerification] = useState("all");
  const [vehicleType, setVehicleType] = useState("all");

  useEffect(() => {
    let active = true;
    let loading = false;
    let queued = false;
    const controller = new AbortController();
    const load = async () => {
      if (!active) return;
      if (loading) { queued = true; return; }
      loading = true;
      setRefreshing(true);
      try {
        const [drivers, accounts, jobs] = await Promise.all([
          allRows(() => supabase.from("driver_profiles").select("id,user_id,full_name,phone,vehicle_name,vehicle_type,license_plate,capacity_tonnes,location_area,verification_status,availability_status,created_at").order("created_at", { ascending: false }).order("id").abortSignal(controller.signal)),
          allRows(() => supabase.from("profiles").select("id,is_suspended,deleted_at").order("id").abortSignal(controller.signal)),
          allRows(() => supabase.from("transport_requests").select("id,accepted_driver_id").in("status", ADMIN_ACTIVE_STATUSES).order("id").abortSignal(controller.signal)),
        ]);
        const accountMap = new Map(accounts.map((account) => [account.id, account]));
        const occupied = new Set(jobs.map((job) => job.accepted_driver_id));
        if (!active) return;
        setTrucks(drivers.map((truck) => ({ ...truck, availability: truckAvailability(truck, accountMap.get(truck.user_id), occupied.has(truck.user_id)), suspended: Boolean(accountMap.get(truck.user_id)?.is_suspended) })));
        setUpdatedAt(new Date());
        setError("");
      } catch {
        if (active) setError("Could not refresh trucks. Availability may have changed. Please retry.");
      } finally {
        loading = false;
        if (active) {
          setRefreshing(false);
          if (queued) { queued = false; void load(); }
        }
      }
    };
    void load();
    const refreshVisible = () => { if (document.visibilityState === "visible") void load(); };
    const channel = supabase.channel("admin-trucks")
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_profiles" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "transport_requests" }, load)
      .subscribe();
    const timer = setInterval(refreshVisible, 15000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      void supabase.removeChannel(channel);
    };
  }, [refreshKey]);

  const visible = (trucks || []).filter((truck) => truckMatches(truck, search)
    && (availability === "all" || truck.availability === availability)
    && (verification === "all" || truck.verification_status === verification)
    && (vehicleType === "all" || truck.vehicle_type === vehicleType));
  const tonnageCounts = truckTonnageCounts(visible);
  const types = [...new Set((trucks || []).map((truck) => truck.vehicle_type).filter(Boolean))].sort();
  const selectStyle = "h-11 rounded-xl border border-border bg-card px-3 text-sm w-full";

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div><h1 className="text-2xl font-bold tracking-tight">Truck management</h1><p className="text-sm text-muted-foreground mt-1">Registered vehicles, payload capacity and driver availability.</p></div>
        <button className="inline-flex items-center h-10 px-4 text-sm font-medium border border-border rounded-xl bg-card disabled:opacity-50" disabled={refreshing} onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />Refresh</button>
      </div>
      {error && <div role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex gap-2"><AlertTriangle className="h-5 w-5 shrink-0" /><span>{error} <button className="underline font-semibold" onClick={() => setRefreshKey((key) => key + 1)}>Retry</button></span></div>}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        {[ ["all", "Registered vehicles"], ...Object.entries(labels) ].map(([key, label]) => <button key={key} onClick={() => setAvailability(key)} aria-pressed={availability === key} className={`text-left bg-card rounded-2xl border p-4 ${availability === key ? "border-primary ring-1 ring-primary" : "border-border"}`}><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold mt-1">{trucks === null ? "—" : trucks.filter((truck) => key === "all" || truck.availability === key).length}</p></button>)}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <div className="relative"><label className="sr-only" htmlFor="truck-search">Search trucks</label><Search className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" /><input id="truck-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Plate, driver, vehicle or area…" className={`${selectStyle} pl-9`} /></div>
        <select aria-label="Availability" value={availability} onChange={(event) => setAvailability(event.target.value)} className={selectStyle}><option value="all">All availability</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="Verification status" value={verification} onChange={(event) => setVerification(event.target.value)} className={selectStyle}><option value="all">All verification statuses</option><option value="approved">Approved</option><option value="pending">Pending review</option><option value="rejected">Rejected</option></select>
        <select aria-label="Vehicle type" value={vehicleType} onChange={(event) => setVehicleType(event.target.value)} className={selectStyle}><option value="all">All vehicle types</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select>
      </div>
      <p className="text-xs text-muted-foreground mb-5">Available means approved, online, account active and no active assigned job. {updatedAt && `Last refreshed ${updatedAt.toLocaleTimeString()}.`}</p>
      {trucks === null && !error ? <div role="status" className="flex justify-center gap-2 py-16"><Loader2 className="h-5 w-5 animate-spin" />Loading trucks…</div> : trucks !== null && <>
        <section aria-labelledby="truck-capacity-chart" className="bg-card border border-border rounded-2xl p-4 sm:p-5 mb-6">
          <h2 id="truck-capacity-chart" className="font-bold text-lg">Trucks by tonnage</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Number of registered vehicles at each payload capacity. Uses the search and filters above.</p>
          {tonnageCounts.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No trucks match these filters.</p> : <>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Truck count by tonnage bar chart; scroll horizontally if needed">
              <div style={{ minWidth: Math.max(480, tonnageCounts.length * 72), height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tonnageCounts} margin={{ top: 24, right: 24, bottom: 25, left: 12 }} accessibilityLayer>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="tonnage" interval={0} height={55} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} label={{ value: "Tonnage (tonnes)", position: "insideBottom", offset: -8, fill: "hsl(var(--foreground))" }} />
                    <YAxis allowDecimals={false} width={54} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} label={{ value: "Number of trucks", angle: -90, position: "insideLeft", fill: "hsl(var(--foreground))", style: { textAnchor: "middle" } }} />
                    <Tooltip cursor={{ fill: "hsl(var(--muted))" }} contentStyle={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 12 }} formatter={(value) => [value, "Trucks"]} labelFormatter={(label) => label === "Not provided" ? "Tonnage not provided" : `${label} payload`} />
                    <Bar dataKey="trucks" name="Trucks" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} maxBarSize={64} isAnimationActive={false}>
                      <LabelList dataKey="trucks" position="top" fill="hsl(var(--foreground))" fontSize={12} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1 sm:hidden">Scroll the chart sideways to see every tonnage.</p>
            <table className="sr-only"><caption>Truck counts by payload capacity for current filters</caption><thead><tr><th scope="col">Tonnage</th><th scope="col">Number of trucks</th></tr></thead><tbody>{tonnageCounts.map((row) => <tr key={row.tonnage}><th scope="row">{row.tonnage}</th><td>{row.trucks}</td></tr>)}</tbody></table>
          </>}
        </section>
        <p className="text-sm text-muted-foreground mb-3">Showing {visible.length} of {trucks.length} registered vehicles{error ? " · Last successful refresh" : ""}</p>
        {visible.length === 0 ? <div className="text-center bg-card border border-border rounded-2xl p-12"><Truck className="w-10 h-10 mx-auto text-muted-foreground mb-3" /><p className="font-semibold">No trucks found</p><p className="text-sm text-muted-foreground mt-1">{trucks.length ? "Try changing your search or filters." : "Trucks will appear when drivers register their vehicles."}</p></div> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((truck) => <article key={truck.id} className="min-w-0 bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2 mb-4"><Truck className="w-6 h-6 text-primary" /><span className={`text-xs font-semibold rounded-full px-3 py-1 ${error ? "bg-muted text-muted-foreground" : colours[truck.availability]}`}>{error ? "Availability unconfirmed" : labels[truck.availability]}</span></div>
            <h2 className="font-bold text-lg break-words">{truck.vehicle_name || "Registered vehicle"}</h2><p className="text-sm text-muted-foreground">{truck.vehicle_type || "Vehicle type not provided"}</p>
            <div className="my-4 rounded-xl bg-primary/10 border border-primary/20 p-4"><p className="text-xs font-medium text-muted-foreground mb-1">PAYLOAD CAPACITY</p><p className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight">{bidTonnage(truck).toUpperCase()}</p></div>
            <dl className="space-y-3 text-sm"><div><dt className="text-xs text-muted-foreground">Licence plate</dt><dd className="font-bold tracking-wider break-words">{truck.license_plate || "Not provided"}</dd></div><div><dt className="text-xs text-muted-foreground">Driver</dt><dd className="font-semibold break-words">{truck.full_name || "Name not provided"}</dd><dd className="text-muted-foreground">{truck.phone || "Phone not provided"}</dd></div><div><dt className="text-xs text-muted-foreground">Operating area</dt><dd className="flex items-start gap-1"><MapPin className="w-4 h-4 shrink-0 mt-0.5" />{truck.location_area || "Not provided"}</dd></div><div><dt className="text-xs text-muted-foreground">Verification</dt><dd className="capitalize font-medium flex items-center gap-1">{truck.verification_status === "approved" && <BadgeCheck className="w-4 h-4 text-emerald-600" />}{truck.verification_status === "pending" ? "Pending review" : truck.verification_status}{truck.suspended && " · Account suspended"}</dd></div></dl>
            <div className="mt-5 pt-4 border-t border-border flex flex-wrap gap-3 text-sm font-semibold"><Link to="/admin/verification" className="text-primary hover:underline">Review verification</Link><Link to="/admin/users" className="text-primary hover:underline">Manage driver</Link></div>
          </article>)}
        </div>}
      </>}
    </div>
  );
}
