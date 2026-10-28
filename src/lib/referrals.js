export function normalizeReferralCode(value) {
  return String(value || '').trim().toUpperCase();
}
export function driverReferralLink(code) {
  return `https://www.movezw.co.zw/register?role=driver&ref=${encodeURIComponent(normalizeReferralCode(code))}`;
}
