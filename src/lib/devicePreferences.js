export const LOCATION_PREFERENCE_EVENT = "movezw-location-preference";
export const NATIVE_PUSH_PREFERENCE_EVENT = "movezw-native-push-preference";

const LOCATION_KEY = "movezw_location_enabled";
const NATIVE_PUSH_KEY = "movezw_native_push_enabled";

// Both safety-critical settings start enabled. A stored "off" value is the
// only thing that disables them, so upgrades and fresh installs keep the
// intended default without overwriting a choice the user already made.
export function isLocationTrackingEnabled() {
  return window.localStorage.getItem(LOCATION_KEY) !== "off";
}

export function setLocationTrackingEnabled(enabled) {
  window.localStorage.setItem(LOCATION_KEY, enabled ? "on" : "off");
  window.dispatchEvent(new CustomEvent(LOCATION_PREFERENCE_EVENT, { detail: { enabled } }));
}

export function isNativePushEnabled() {
  return window.localStorage.getItem(NATIVE_PUSH_KEY) !== "off";
}

export function setNativePushPreference(enabled) {
  window.localStorage.setItem(NATIVE_PUSH_KEY, enabled ? "on" : "off");
  window.dispatchEvent(new CustomEvent(NATIVE_PUSH_PREFERENCE_EVENT, { detail: { enabled } }));
}
