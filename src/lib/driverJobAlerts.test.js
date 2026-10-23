import test from 'node:test';
import assert from 'node:assert/strict';
import { driverJobAlertQueue } from './driverJobAlerts.js';

const now = Date.parse('2026-10-23T10:00:00Z');
const job = (id, overrides = {}) => ({ id, status: 'open', created_at: new Date(now - 1000).toISOString(), ...overrides });
const alert = (id, requestId, overrides = {}) => ({ id, type: 'job_assigned', is_read: false, link: `/driver/job/${requestId}`, created_at: new Date(now - 1000).toISOString(), ...overrides });

test('each independent load stays in the popup queue, oldest first', () => {
  const jobs = [job('load-1'), job('load-2'), job('load-3')];
  const notifications = [alert('c', 'load-3'), alert('a', 'load-1'), alert('b', 'load-2')];
  assert.deepEqual(driverJobAlertQueue(notifications, jobs, now).map((n) => n.id), ['a', 'b', 'c']);
});

test('closed, expired, accepted and already-read jobs never reopen popups', () => {
  const jobs = [job('closed', { status: 'cancelled' }), job('expired', { created_at: '2026-10-21T00:00:00Z' }), job('accepted', { accepted_driver_id: 'another-driver' }), job('read'), job('ready')];
  const notifications = jobs.map((j) => alert(j.id, j.id, { is_read: j.id === 'read' }));
  assert.deepEqual(driverJobAlertQueue(notifications, jobs, now).map((n) => n.id), ['ready']);
});

test('legacy duplicates and unrelated notification links do not cause duplicate or unsafe popups', () => {
  const notifications = [alert('b', 'job'), alert('a', 'job'), alert('c', 'missing'), alert('d', 'job', { link: '//external.example/job' }), alert('e', 'job', { type: 'new_offer' })];
  assert.deepEqual(driverJobAlertQueue(notifications, [job('job')], now).map((n) => n.id), ['a']);
});

test('a future scheduled job remains visible until its own deadline', () => {
  assert.equal(driverJobAlertQueue([alert('a', 'later')], [job('later', { timing: 'scheduled', scheduled_date: '2026-11-01T10:00:00Z', created_at: '2026-10-01T00:00:00Z' })], now).length, 1);
});
