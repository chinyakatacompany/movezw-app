// Availability is a booking decision: approval and account access take priority
// over a driver's online toggle; an assigned delivery still makes them busy.
export function truckAvailability(truck, account, hasActiveJob = false) {
  if (!account || account.is_suspended || account.deleted_at || truck.verification_status !== 'approved') return 'unavailable';
  if (hasActiveJob || truck.availability_status === 'busy') return 'busy';
  return truck.availability_status === 'online' ? 'available' : 'offline';
}

export function truckMatches(truck, search) {
  const query = search.trim().toLocaleLowerCase();
  return !query || [truck.full_name, truck.phone, truck.vehicle_name, truck.vehicle_type, truck.license_plate, truck.location_area]
    .some((value) => String(value || '').toLocaleLowerCase().includes(query));
}

export function truckTonnageCounts(trucks) {
  const categories = ["Pickup", "Articulated Truck", "Cargo Van"];
  const categoryCounts = new Map(categories.map((type) => [type, 0]));
  const counts = new Map([[30, 0]]);
  for (const truck of trucks) {
    const type = String(truck.vehicle_type || "").trim().toLowerCase();
    const category = categories.find((name) => name.toLowerCase() === type);
    if (category) {
      categoryCounts.set(category, categoryCounts.get(category) + 1);
      continue;
    }
    const recorded = Number(truck.capacity_tonnes);
    const legacy = String(truck.vehicle_type || '').match(/(\d+(?:\.\d+)?)\s*ton/i);
    const capacity = Number.isFinite(recorded) && recorded > 0 ? recorded : Number(legacy?.[1]);
    const key = Number.isFinite(capacity) && capacity > 0 ? capacity : null;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a === null ? 1 : b === null ? -1 : a - b)
    .map(([tonnes, trucks]) => ({ tonnage: tonnes === null ? 'Not provided' : `${tonnes} t`, trucks }))
    .concat(categories.map((type) => ({ tonnage: type, trucks: categoryCounts.get(type) })));
}
