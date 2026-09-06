export const REQUEST_LIFETIME_MS = 10 * 60 * 60 * 1000;

export function requestDeadline(request) {
  const start = request.timing === "scheduled"
    ? (request.scheduled_date || request.created_at) : request.created_at;
  return new Date(start).getTime() + REQUEST_LIFETIME_MS;
}

export function isRequestExpired(request, now = Date.now()) {
  if (!request) return false;
  if (request.expired_at) return true;
  return request.status === "open" && !request.accepted_driver_id
    && now >= requestDeadline(request);
}
