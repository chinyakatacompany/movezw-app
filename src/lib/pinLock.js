// Device-local "quick unlock" PIN — NOT a server-side auth factor. Real
// authentication stays Supabase email/password; this only gates the UI on
// an already-valid session so someone doesn't have to retype their
// password every time they reopen the app on the same device. Scoped per
// user id (a device/browser could be shared by more than one account).
//
// PinGate itself tracks "unlocked" purely in React state — it only needs
// to survive client-side navigation, which a mounted component already
// does. The one exception is the full-page reload Login.jsx triggers right
// after a real password login: markFreshLogin/consumeFreshLogin is a
// single-use sessionStorage token that lets PinGate skip the PIN for just
// that one reload, so it doesn't ask again immediately after they typed
// their password. Any reload after that (a manual refresh, reopening the
// app, etc.) finds the token already consumed and asks for the PIN.

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const hashKey = (userId) => `movzw_pin_hash_${userId}`;
const freshLoginKey = (userId) => `movzw_pin_fresh_login_${userId}`;

export function hasPin(userId) {
  return !!userId && !!localStorage.getItem(hashKey(userId));
}

export async function setPin(userId, pin) {
  localStorage.setItem(hashKey(userId), await sha256Hex(`${userId}:${pin}`));
}

export function removePin(userId) {
  localStorage.removeItem(hashKey(userId));
}

export async function verifyPin(userId, pin) {
  const stored = localStorage.getItem(hashKey(userId));
  if (!stored) return false;
  return (await sha256Hex(`${userId}:${pin}`)) === stored;
}

export function markFreshLogin(userId) {
  if (userId) sessionStorage.setItem(freshLoginKey(userId), "1");
}

export function consumeFreshLogin(userId) {
  if (!userId) return false;
  const key = freshLoginKey(userId);
  const had = sessionStorage.getItem(key) === "1";
  if (had) sessionStorage.removeItem(key);
  return had;
}
