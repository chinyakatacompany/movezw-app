import { supabase } from "@/api/supabaseClient";
import { createNotification, formatMoney } from "@/lib/movezw";

export const AVAILABILITY = {
  online: "online",
  busy: "busy",
  offline: "offline",
};

export const AVAILABILITY_LABELS = {
  online: "Online",
  busy: "Busy",
  offline: "Offline",
};

// Vehicle capacity ordering — ready for future cargo-weight → vehicle matching
export const VEHICLE_CAPACITY_RANK = {
  Motorcycle: 1,
  Pickup: 2,
  "1 Ton Truck": 3,
  "3 Ton Truck": 4,
  "5 Ton Truck": 5,
  "10 Ton Truck": 6,
  "Articulated Truck": 7,
};

// Haversine distance in km — ready for future live GPS proximity matching
export function distanceKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Whether a driver's vehicle can service the request.
// Today: any approved vehicle qualifies (request has no vehicle preference).
// Future: map cargo_weight → required VEHICLE_CAPACITY_RANK and compare.
export function vehicleFits(driver, _request) {
  return Boolean(driver.vehicle_type);
}

// Score a driver for a request (higher = better match).
export function scoreDriver(driver, request) {
  let score = 0;

  // Rating 0–5 → up to 40 pts
  score += (driver.rating_avg || 0) * 8;

  // Completed deliveries (capped, reflects reliability)
  score += Math.min(driver.completed_jobs || 0, 50) * 0.4;

  // Location proximity: area substring overlap with pickup → 15 pts
  const area = (driver.location_area || "").toLowerCase();
  const pickup = (request.pickup_location || "").toLowerCase();
  if (area && pickup && (pickup.includes(area) || area.includes(pickup))) {
    score += 15;
  }

  // Live GPS proximity (future): when both driver and request carry coords,
  // weight closer drivers higher. Distance bonus placeholder:
  const dist = distanceKm(driver.latitude, driver.longitude, request.latitude, request.longitude);
  if (dist != null) {
    score += Math.max(0, 30 - dist); // 30km radius, closer = more
  }

  // Response-time freshness: how recently the driver went online
  if (driver.last_available_at) {
    const mins = (Date.now() - new Date(driver.last_available_at).getTime()) / 60000;
    if (mins < 5) score += 5;
    else if (mins < 30) score += 2;
  }

  return { driver, score };
}

// Return ranked list of qualified, available drivers for a request.
export function findMatchingDrivers(request, drivers) {
  return drivers
    .filter((d) => d.verification_status === "approved")
    .filter((d) => (d.availability_status || "offline") === "online")
    .filter((d) => vehicleFits(d, request))
    .map((d) => scoreDriver(d, request))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.driver);
}

// Fetch drivers, match against a request, and notify the top matches.
// Best-effort, client-side; designed to move to a backend function later.
export async function notifyMatchingDriversForRequest(request, limit = 10) {
  const { data: drivers, error } = await supabase
    .from("driver_public_profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) console.error("Failed to load drivers for matching:", error);
  const matched = findMatchingDrivers(request, drivers || []).slice(0, limit);
  const budgetLabel = request.budget ? `$${request.budget}` : "flexible budget";
  await Promise.all(
    matched.map((d) =>
      createNotification(
        d.user_id,
        "job_assigned",
        "New job match nearby",
        `${request.cargo_type} · ${request.pickup_location} → ${request.destination} (${budgetLabel})`,
        `/driver/job/${request.id}`
      )
    )
  );
  return matched.length;
}

// Loose place-name match — same substring-overlap approach as the driver
// location scoring above, applied to both ends of a route.
function placesMatch(a, b) {
  if (!a || !b) return false;
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  return x === y || x.includes(y) || y.includes(x);
}

function routesMatch(originA, destA, originB, destB) {
  return placesMatch(originA, originB) && placesMatch(destA, destB);
}

// When a driver lists empty return-trip space, notify customers who already
// have an open request heading the same way — they may prefer the driver's
// return-load price to waiting for regular offers.
export async function notifyMatchingCustomersForReturnLoad(load) {
  const { data: requests, error } = await supabase
    .from("transport_requests")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) console.error("Failed to load requests for return-load matching:", error);
  const matched = (requests || []).filter((r) =>
    routesMatch(load.origin, load.destination, r.pickup_location, r.destination)
  );
  await Promise.all(
    matched.map((r) =>
      createNotification(
        r.customer_id,
        "return_load_match",
        "Return-trip space available 🚚",
        `A driver has space ${load.origin} → ${load.destination} for ${formatMoney(load.price)} — could suit your ${r.cargo_type} request.`,
        "/return-loads"
      )
    )
  );
  return matched.length;
}

// When a customer posts a new request, notify drivers who already listed
// empty return-trip space heading the same way.
export async function notifyMatchingReturnLoadDriversForRequest(request) {
  const { data: loads, error } = await supabase
    .from("return_loads")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) console.error("Failed to load return loads for request matching:", error);
  const matched = (loads || []).filter((l) =>
    routesMatch(l.origin, l.destination, request.pickup_location, request.destination)
  );
  await Promise.all(
    matched.map((l) =>
      createNotification(
        l.driver_id,
        "return_load_match",
        "Matching customer request 📦",
        `A customer needs ${request.cargo_type} moved ${request.pickup_location} → ${request.destination} — matches your return trip.`,
        `/driver/job/${request.id}`
      )
    )
  );
  return matched.length;
}
