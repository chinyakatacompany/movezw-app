import test from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout } from './withTimeout.js';

test('a stalled auth operation ends with an actionable timeout', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 5), /Connection timed out/);
});

test('an operation can succeed after a previous request timed out', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 5));
  assert.deepEqual(await withTimeout(Promise.resolve({ user: { id: 'driver' } })), { user: { id: 'driver' } });
});

test('original request errors are preserved', async () => {
  const error = new Error('Profile unavailable');
  await assert.rejects(withTimeout(Promise.reject(error)), (actual) => actual === error);
});
