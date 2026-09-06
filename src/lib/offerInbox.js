// A price revision is a fresh alert, even when it reuses the offer row.
export function offerRevision(offer) {
  return JSON.stringify([offer.id, offer.updated_at || offer.created_at, offer.price, offer.eta_minutes, offer.note]);
}

export function pendingOfferQueue(offers, requests, reviewed, now = Date.now()) {
  const openRequests = new Map(requests.filter((r) => {
    const start = r.timing === 'scheduled' ? (r.scheduled_date || r.created_at) : r.created_at;
    const deadline = Date.parse(start) + 10 * 60 * 60 * 1000;
    return r.status === 'open' && !r.accepted_driver_id && !r.expired_at && now < deadline;
  }).map((r) => [r.id, r]));
  return offers.filter((o) => o.status === 'pending' && openRequests.has(o.request_id)
    && reviewed[o.id] !== offerRevision(o))
    .map((o) => ({ ...o, request: openRequests.get(o.request_id) }))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
}
