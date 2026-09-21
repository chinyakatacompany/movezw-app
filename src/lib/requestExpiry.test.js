import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRequestExpired, requestDeadline } from './requestExpiry.js';

const base = { status: 'open', timing: 'now', created_at: '2026-09-06T08:00:00Z' };
test('Now jobs disappear exactly ten hours after posting', () => {
  const deadline = Date.parse('2026-09-06T18:00:00Z');
  assert.equal(requestDeadline(base), deadline);
  assert.equal(isRequestExpired(base, deadline - 1), false);
  assert.equal(isRequestExpired(base, deadline), true);
});
test('scheduled jobs use pickup time with its timezone, not creation time', () => {
  const job = { ...base, timing: 'scheduled', scheduled_date: '2026-09-08T08:00:00+02:00' };
  assert.equal(requestDeadline(job), Date.parse('2026-09-08T16:00:00Z'));
  assert.equal(isRequestExpired(job, Date.parse('2026-09-07T18:00:00Z')), false);
});
test('accepted and ongoing jobs never expire due to age', () => {
  for (const status of ['confirmed', 'en_route_pickup', 'collected', 'in_transit', 'delivered', 'completed']) {
    assert.equal(isRequestExpired({ ...base, status }, Infinity), false);
  }
  assert.equal(isRequestExpired({ ...base, accepted_driver_id: 'driver' }, Infinity), false);
});
test('server-expired jobs stay hidden; ordinary cancellations remain in history', () => {
  assert.equal(isRequestExpired({ ...base, status: 'cancelled', expired_at: base.created_at }), true);
  assert.equal(isRequestExpired({ ...base, status: 'cancelled' }), false);
});
