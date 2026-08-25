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
