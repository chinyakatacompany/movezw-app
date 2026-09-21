import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offerRevision, pendingOfferQueue } from './offerInbox.js';
const now = Date.parse('2026-09-06T10:00:00Z');
const request = { id: 'job', status: 'open', timing: 'now', created_at: '2026-09-06T09:00:00Z' };
const first = { id: 'a', request_id: 'job', status: 'pending', price: 20, created_at: '2026-09-06T09:01:00Z' };
const second = { ...first, id: 'b', price: 25, created_at: '2026-09-06T09:02:00Z' };
test('simultaneous bids stay separate and oldest first', () => {
  assert.deepEqual(pendingOfferQueue([second, first], [request], {}, now).map((o) => o.id), ['a', 'b']);
});
test('reviewing one offer leaves other offers queued, including after reload', () => {
  const reviewed = JSON.parse(JSON.stringify({ a: offerRevision(first) }));
  assert.deepEqual(pendingOfferQueue([first, second], [request], reviewed, now).map((o) => o.id), ['b']);
});
test('revised price reappears after the old offer was reviewed', () => {
  assert.equal(pendingOfferQueue([{ ...first, price: 18 }], [request], { a: offerRevision(first) }, now).length, 1);
});
test('closed, expired, rejected and unrelated bids are excluded', () => {
  assert.equal(pendingOfferQueue([first], [{ ...request, status: 'confirmed' }], {}, now).length, 0);
  assert.equal(pendingOfferQueue([first], [request], {}, now + 12 * 3600000).length, 0);
  assert.equal(pendingOfferQueue([{ ...first, status: 'rejected' }, { ...second, request_id: 'other' }], [request], {}, now).length, 0);
});
