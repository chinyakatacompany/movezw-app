import { isRequestExpired } from './requestExpiry.js';

export const DRIVER_ALERT_EVENT = 'movezw-driver-alert';

export function driverJobAlertQueue(notifications, requests, now = Date.now()) {
  const open = new Map(requests.filter((r) => r.status === 'open' && !r.accepted_driver_id && !isRequestExpired(r, now)).map((r) => [r.id, r]));
  const seen = new Set();
  return [...notifications].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id))
    .filter((n) => {
      const requestId = /^\/driver\/job\/([^/?#]+)$/.exec(n.link || '')?.[1];
      if (n.type !== 'job_assigned' || n.is_read || !open.has(requestId) || seen.has(requestId)) return false;
      seen.add(requestId);
      return true;
    });
}
