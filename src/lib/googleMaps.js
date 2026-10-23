import { supabase } from '@/api/supabaseClient';
import { withTimeout } from '@/lib/withTimeout';

let settingsPromise;
let loaderPromise;
let loadedKey;
export const GOOGLE_MAPS_CONFIG_EVENT = 'movezw-google-maps-config';

export function clearGoogleMapsSettings() {
  settingsPromise = null;
  window.dispatchEvent(new Event(GOOGLE_MAPS_CONFIG_EVENT));
}

export function getGoogleMapsSettings() {
  if (!settingsPromise) settingsPromise = (async () => {
    const env = /** @type {any} */ (import.meta).env || {};
    if (env.VITE_GOOGLE_MAPS_BROWSER_KEY) return { key: env.VITE_GOOGLE_MAPS_BROWSER_KEY, mapId: env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID' };
    const { data, error } = await withTimeout(supabase.from('site_content').select('key,value')
      .in('key', ['maps.google.browser_key', 'maps.google.map_id']), 5000);
    if (error) throw error;
    const values = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    return { key: String(values['maps.google.browser_key'] || '').trim(), mapId: String(values['maps.google.map_id'] || 'DEMO_MAP_ID').trim() || 'DEMO_MAP_ID' };
  })().catch((error) => { settingsPromise = null; throw error; });
  return settingsPromise;
}

// One script per document, with bounded loading and explicit auth failure.
// This is a restricted, public browser key; never use a server/service key here.
export function loadGoogleMaps(key) {
  if (!key) return Promise.reject(new Error('Google Maps is not configured.'));
  if (loadedKey && loadedKey !== key) return Promise.reject(new Error('Google Maps settings changed. Reload MoveZW.'));
  if (loaderPromise) return loaderPromise;
  loadedKey = key;
  loaderPromise = new Promise((resolve, reject) => {
    const runtime = /** @type {any} */ (window);
    const script = document.createElement('script');
    let timer;
    const fail = (error) => {
      clearTimeout(timer);
      script.remove();
      loaderPromise = null;
      loadedKey = null;
      reject(error);
    };
    runtime.__movezwGoogleMapsReady = () => {
      clearTimeout(timer);
      resolve(runtime.google.maps);
    };
    runtime.gm_authFailure = () => {
      const message = 'Google Maps could not authorize this app. Check the API key, billing and allowed websites.';
      window.dispatchEvent(new CustomEvent('movezw-google-maps-auth-error', { detail: message }));
      fail(new Error(message));
    };
    script.id = 'movezw-google-maps';
    const params = new URLSearchParams({ key, v: 'quarterly', libraries: 'maps,marker', loading: 'async', region: 'ZW', language: 'en', callback: '__movezwGoogleMapsReady' });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => fail(new Error('Google Maps could not load. Check your connection and retry.'));
    timer = setTimeout(() => fail(new Error('Google Maps took too long to load. Retry when connected.')), 15000);
    document.head.appendChild(script);
  });
  return loaderPromise;
}
