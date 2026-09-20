// navigator.geolocation still exists as an object on insecure (plain
// http://) origins, but calling getCurrentPosition() there immediately
// fails with a cryptic browser error ("Only secure origins are allowed...").
// Check isSecureContext up front so callers can show something actionable
// instead of that raw message.
export function geolocationUnavailableReason() {
  if (!navigator.geolocation) return "Your browser doesn't support GPS location.";
  if (!window.isSecureContext) return "Location requires a secure (https://) connection — it won't work over a plain http:// address.";
  return null;
}

export function locationErrorMessage(error) {
  if (error?.code === 1) return "Location access is blocked. Allow location for MoveZW in your phone or browser settings.";
  if (error?.code === 2) return "Your location could not be determined. Turn on GPS and try again.";
  if (error?.code === 3) return "Getting your location took too long. Check GPS or your connection and try again.";
  return error?.message || "MoveZW could not access your location.";
}

export async function getLocationPermissionState() {
  const reason = geolocationUnavailableReason();
  if (reason) return { state: "unavailable", reason };
  if (!navigator.permissions?.query) return { state: "prompt", reason: null };
  try {
    const permission = await navigator.permissions.query({ name: "geolocation" });
    return { state: permission.state, reason: null };
  } catch {
    // Android WebView versions that do not expose the Permissions API still
    // show the native runtime prompt when getCurrentPosition is called.
    return { state: "prompt", reason: null };
  }
}

export function requestCurrentLocation(options = {}) {
  const reason = geolocationUnavailableReason();
  if (reason) return Promise.reject(new Error(reason));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => reject(new Error(locationErrorMessage(error))),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0, ...options }
    );
  });
}

// Build the most locally-specific label the free OSM data actually has —
// road + suburb + city — instead of Nominatim's default display_name, which
// tails off into province/country and can bury (or in sparser areas, lose)
// the specific area. Note: OSM only indexes suburb-level areas in Zimbabwe
// (e.g. "Budiriro"), not numbered sections within them (e.g. "Budiriro 5
// West") — that finer detail isn't in the free dataset, so this is the most
// precise text this data source can produce.
export function formatReverseAddress(data) {
  const a = data?.address;
  if (!a) return data?.display_name || null;
  const parts = [];
  if (a.road) parts.push(a.road);
  const area = a.suburb || a.neighbourhood || a.quarter || a.village || a.town;
  if (area) parts.push(area);
  if (a.city || a.county) parts.push(a.city || a.county);
  return parts.length > 0 ? parts.join(", ") : data.display_name || null;
}

// One-off forward geocode for a raw address string that was saved without
// exact coordinates — e.g. a customer typed a pickup/destination without
// picking a suggestion from AddressSearchInput.jsx, which is the only place
// pickup_lat/lng or destination_lat/lng normally gets set. Same free
// Nominatim endpoint and Zimbabwe viewbox that component uses. Best-effort:
// returns null on any failure or empty match rather than throwing.
export async function geocodeAddress(text) {
  if (!text?.trim()) return null;
  try {
    const params = new URLSearchParams({
      format: "json",
      q: text,
      countrycodes: "zw",
      viewbox: "25.0,-15.5,33.1,-22.5",
      limit: "1",
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const hit = Array.isArray(data) ? data[0] : null;
    if (!hit) return null;
    return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
  } catch {
    return null;
  }
}
