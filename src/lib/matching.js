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
  "Cargo Van": 3,
  "1 Ton Truck": 4,
  "3 Ton Truck": 5,
  "5 Ton Truck": 6,
  "10 Ton Truck": 7,
  "Articulated Truck": 8,
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

// Real road-driving distance between two points, via the same free OSRM
// endpoint RouteMap.jsx uses — a straight-line Haversine distance under-
// counts actual travel distance (often significantly, depending on the
// road network), so anywhere a number is used to price a job it should
// match what the customer's own route map shows, not a straight line.
// OSRM's free demo server is occasionally flaky, so this retries a couple
// of times before giving up rather than immediately handing back null —
// callers should show a retry/unavailable state on null, not silently
// substitute a straight-line estimate as if it were the real distance.
export async function fetchRoadDistanceKm(from, to, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`
      );
      const data = await res.json();
      const route = data?.routes?.[0];
      if (data.code === "Ok" && route) return route.distance / 1000;
    } catch {
      // fall through to retry
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
  }
  return null;
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
    .rpc("fn_driver_public_profiles")
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

// When a driver lists empty return-trip space, notify every customer so the
// listing gets real visibility (customers browse-and-book return loads the
// same way they'd post a fresh request — there's no reason to limit this to
// people who happen to already have a matching open request). Customers
// whose open request's route actually matches get a specific, personalized
// message; everyone else gets a general heads-up about the new route.
export async function notifyMatchingCustomersForReturnLoad(load) {
  const [{ data: requests, error: reqErr }, { data: allCustomers, error: custErr }] = await Promise.all([
    supabase.from("transport_requests").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(200),
    supabase.rpc("fn_all_customer_ids"),
  ]);
  if (reqErr) console.error("Failed to load requests for return-load matching:", reqErr);
  if (custErr) console.error("Failed to load customers for return-load broadcast:", custErr);

  const matchedByCustomer = new Map();
  for (const r of requests || []) {
    if (routesMatch(load.origin, load.destination, r.pickup_location, r.destination)) {
      matchedByCustomer.set(r.customer_id, r);
    }
  }

  const routeLabel = `${load.origin} → ${load.destination}`;
  await Promise.all(
    (allCustomers || []).map((c) => {
      const matchedRequest = matchedByCustomer.get(c.id);
      return createNotification(
        c.id,
        "return_load_match",
        "Return-trip space available 🚚",
        matchedRequest
          ? `A driver has space ${routeLabel} for ${formatMoney(load.price)} — could suit your ${matchedRequest.cargo_type} request.`
          : `A driver has space ${routeLabel} for ${formatMoney(load.price)}. Need something moved that way?`,
        "/return-loads"
      );
    })
  );
  return { matched: matchedByCustomer.size, total: (allCustomers || []).length };
}

// Inserts a return_loads row and fires both notification paths (in-app +
// push) — shared by DriverReturnLoads.jsx's "New listing" form and
// ReturnLoadPrompt.jsx (the post-delivery nudge), so both ways of creating
// a listing behave identically instead of drifting apart.
export async function createReturnLoad(fields) {
  const { data, error } = await supabase.from("return_loads").insert(fields).select().single();
  if (error) throw error;
  try {
    await notifyMatchingCustomersForReturnLoad({ origin: fields.origin, destination: fields.destination, price: fields.price });
  } catch (e) {
    console.error("Failed to notify matching customers:", e);
  }
  try {
    await supabase.functions.invoke("notify-return-load-push", {
      body: { origin: fields.origin, destination: fields.destination, price: fields.price },
    });
  } catch (e) {
    console.error("Failed to send return-load push alerts:", e);
  }
  return data;
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

// ---- "Space available" — mid-trip second-customer matching ----
// Distance (km) within which an open request's pickup/destination counts as
// "along the same road" as a driver's current job — not the identical trip,
// just close enough to be worth a combined-trip quote.
const SAME_ROAD_MAX_KM = 3;

// Nearest-vertex distance from a point to a route polyline. OSRM samples the
// polyline densely (every ~20-50m along real roads), so nearest-vertex is a
// good enough stand-in for true distance-to-road without point-to-segment math.
function distanceToRouteKm(lat, lng, routeCoordinates) {
  if (lat == null || lng == null || !routeCoordinates?.length) return null;
  let min = Infinity;
  for (const [rLng, rLat] of routeCoordinates) {
    const d = distanceKm(lat, lng, rLat, rLng);
    if (d < min) min = d;
  }
  return min;
}

// Which open requests have a pickup or destination near a driver's road
// route — used when a driver has spare capacity mid-trip.
export function findRequestsAlongRoute(driverRequest, candidates, routeCoordinates, maxKm = SAME_ROAD_MAX_KM) {
  return candidates
    .filter((r) => r.id !== driverRequest.id)
    .map((r) => {
      const pickupDist = distanceToRouteKm(r.pickup_lat, r.pickup_lng, routeCoordinates);
      const destDist = distanceToRouteKm(r.destination_lat, r.destination_lng, routeCoordinates);
      const dist = [pickupDist, destDist].filter((d) => d != null).sort((a, b) => a - b)[0];
      return { request: r, distanceKm: dist };
    })
    .filter((m) => m.distanceKm != null && m.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .map((m) => m.request);
}

// Driver announces spare capacity on an active job: fetch its road route
// (same free OSRM endpoint RouteMap.jsx uses), find other open requests
// along that road, and notify those customers. Best-effort, client-side —
// same fire-and-forget pattern as the return-load matching above; no
// dedup/cooldown state, matching how the rest of this file works.
export async function notifyCustomersAlongRoute(driverRequest) {
  if (
    driverRequest.pickup_lat == null || driverRequest.pickup_lng == null ||
    driverRequest.destination_lat == null || driverRequest.destination_lng == null
  ) {
    throw new Error("This job doesn't have exact pickup/destination coordinates yet.");
  }

  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${driverRequest.pickup_lng},${driverRequest.pickup_lat};${driverRequest.destination_lng},${driverRequest.destination_lat}?overview=full&geometries=geojson`
  );
  const data = await res.json();
  const routeCoordinates = data?.routes?.[0]?.geometry?.coordinates;
  if (data.code !== "Ok" || !routeCoordinates) {
    throw new Error("Couldn't calculate this job's road route — try again shortly.");
  }

  const { data: candidates, error } = await supabase
    .from("transport_requests")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) console.error("Failed to load open requests for space-along-route matching:", error);

  const matched = findRequestsAlongRoute(driverRequest, candidates || [], routeCoordinates);
  await Promise.all(
    matched.map((r) =>
      createNotification(
        r.customer_id,
        "space_along_route",
        "A driver has space along your route 🚚",
        `A driver already heading ${driverRequest.pickup_location} → ${driverRequest.destination} has room for your ${r.cargo_type} too — worth a lower quote.`,
        `/customer/request/${r.id}`
      )
    )
  );
  return matched.length;
}
