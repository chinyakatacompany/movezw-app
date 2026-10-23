import test from 'node:test';
import assert from 'node:assert/strict';
import { driverLocationRequired } from './driverLocationStatus.js';

test('driver work always requires location despite a previous device opt-out', () => {
  assert.equal(driverLocationRequired('online', null), true);
  assert.equal(driverLocationRequired('busy', 'delivery'), true);
  assert.equal(driverLocationRequired('offline', 'delivery'), true);
});
test('location duty ends when an offline/busy driver has no active delivery', () => {
  assert.equal(driverLocationRequired('offline', null), false);
  assert.equal(driverLocationRequired('busy', null), false);
});
