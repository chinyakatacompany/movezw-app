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
