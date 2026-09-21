import { isRequestExpired } from "./requestExpiry.js";

// A price revision is a fresh alert, even when it reuses the offer row.
export function offerRevision(offer) {
  return JSON.stringify([offer.id, offer.updated_at || offer.created_at, offer.price, offer.eta_minutes, offer.note]);
}

export function pendingOfferQueue(offers, requests, reviewed, now = Date.now()) {
  const openRequests = new Map(requests.filter((r) => {
    return r.status === 'open' && !r.accepted_driver_id && !isRequestExpired(r, now);
  }).map((r) => [r.id, r]));
  return offers.filter((o) => o.status === 'pending' && openRequests.has(o.request_id)
    && reviewed[o.id] !== offerRevision(o))
    .map((o) => ({ ...o, request: openRequests.get(o.request_id) }))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
}
