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
