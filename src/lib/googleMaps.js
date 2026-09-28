const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
let googleMapsPromise = null;

export function hasGoogleMapsKey() {
  return Boolean(GOOGLE_MAPS_API_KEY);
}

// The browser key is intentionally public, as required by Maps JavaScript.
// Protect it in Google Cloud with HTTP-referrer restrictions and restrict the
// key to Maps JavaScript API only.
export function loadGoogleMaps() {
  if (!GOOGLE_MAPS_API_KEY) return Promise.reject(new Error("Google Maps API key is not configured"));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-movezw-google-maps="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.google.maps), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load")), { once: true });
      return;
    }

    const callbackName = `movezwGoogleMapsReady_${Date.now()}`;
    const timeoutId = window.setTimeout(() => {
      delete window[callbackName];
      script.remove();
      googleMapsPromise = null;
      reject(new Error("Google Maps took too long to load"));
    }, 12000);

    window[callbackName] = () => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      resolve(window.google.maps);
    };

    const script = document.createElement("script");
    script.dataset.movezwGoogleMaps = "true";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&v=weekly&loading=async&callback=${callbackName}`;
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
      googleMapsPromise = null;
      reject(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}
