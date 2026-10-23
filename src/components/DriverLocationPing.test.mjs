import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate } from 'node:timers';
import { driverLocationRequired } from '../lib/driverLocationStatus.js';

async function mount({ initiallyEnabled = true, activeTrip = true } = {}) {
  let cleanup;
  let poll;
  let enabled = initiallyEnabled;
  let failTrip = false;
  const state = { watches: 0, cleared: 0, statuses: [] };
  const events = new Map();
  const window = {
    addEventListener: (type, cb) => events.set(type, cb),
    removeEventListener: (type) => events.delete(type),
  };
  const supabase = {
    from(table) {
      let updating = false;
      const query = {
        select() { return this; }, update() { updating = true; return this; }, eq() { return this; }, in() { return this; }, order() { return this; }, limit() { return this; }, maybeSingle() { return this; },
        then(resolve, reject) {
          const result = updating ? { error: null }
            : table === 'driver_profiles' ? { data: [{ id: 'profile', availability_status: 'online' }] }
            : failTrip ? { data: null, error: new Error('Network unavailable') } : { data: activeTrip ? { id: 'trip' } : null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
    rpc: async () => ({ error: null }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: async () => {},
  };
  const position = { coords: { latitude: -17.8, longitude: 31.0 } };
  let source = fs.readFileSync(new URL('./DriverLocationPing.jsx', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://example.test'").replaceAll('import.meta.env.VITE_SUPABASE_ANON_KEY', "'public-key'").replace('export default function', 'function');
  source += '\nDriverLocationPing();';
  vm.runInNewContext(source, {
    useEffect: (effect) => { cleanup = effect(); }, useRef: (value) => ({ current: value }), useAuth: () => ({ user: { id: 'driver', role: 'driver' } }),
    Capacitor: { isNativePlatform: () => false }, BackgroundGeolocation: {}, supabase, window,
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    navigator: { geolocation: { getCurrentPosition: (success) => success(position), watchPosition: () => ++state.watches, clearWatch: () => state.cleared++ } },
    isLocationTrackingEnabled: () => enabled,
    setLocationTrackingEnabled: (value) => { enabled = value; events.get('preference')?.(); },
    LOCATION_PREFERENCE_EVENT: 'preference', driverLocationRequired,
    reportDriverLocationStatus: (ready, message) => state.statuses.push({ ready, message }),
    withTimeout: (operation) => operation, Date, console,
    setInterval: (callback) => { poll = callback; return 1; }, clearInterval() {},
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  await flush();
  return { state, cleanup, flush, poll: () => poll(), fail: () => { failTrip = true; }, enabled: () => enabled };
}

test('a failed resume query retains the active GPS watcher', async () => {
  const app = await mount();
  assert.equal(app.state.watches, 1);
  app.fail();
  app.poll();
  await app.flush();
  assert.equal(app.state.watches, 1);
  assert.equal(app.state.cleared, 0);
  assert.equal(app.state.statuses.at(-1).ready, false);
  app.cleanup();
  assert.equal(app.state.cleared, 1);
});

test('required driver tracking restores a stale disabled app preference once', async () => {
  const app = await mount({ initiallyEnabled: false });
  assert.equal(app.enabled(), true);
  assert.equal(app.state.watches, 1);
  app.cleanup();
});
