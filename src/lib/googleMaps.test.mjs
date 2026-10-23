import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loader() {
  const scripts = [];
  const events = [];
  const timers = new Map();
  let counter = 0;
  const window = { dispatchEvent: (event) => events.push(event) };
  const document = { createElement: () => ({ remove() { this.removed = true; } }), head: { appendChild: (script) => scripts.push(script) } };
  let source = fs.readFileSync(new URL('./googleMaps.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replaceAll('export ', '').replace('(import.meta)', '({env:{}})');
  source += '\nglobalThis.load = loadGoogleMaps;';
  const context = vm.createContext({ window, document, URLSearchParams, Error, Promise, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } }, setTimeout: (fn) => { timers.set(++counter, fn); return counter; }, clearTimeout: (id) => timers.delete(id) });
  vm.runInContext(source, context);
  return { load: context.load, window, scripts, events, timers };
}

test('concurrent maps share one authenticated SDK script', async () => {
  const { load, window, scripts } = loader();
  const a = load('restricted-browser-key');
  const b = load('restricted-browser-key');
  assert.equal(a, b);
  assert.equal(scripts.length, 1);
  assert.equal(new URL(scripts[0].src).searchParams.get('region'), 'ZW');
  window.google = { maps: { Map: class {} } };
  window.__movezwGoogleMapsReady();
  assert.equal(await a, window.google.maps);
});
test('network failures permit retry instead of leaving a permanent blank map', async () => {
  const { load, scripts } = loader();
  const pending = load('key');
  scripts[0].onerror();
  await assert.rejects(pending, /could not load/);
  assert.equal(scripts[0].removed, true);
  const retry = load('key');
  assert.equal(scripts.length, 2);
  scripts[1].onerror();
  await assert.rejects(retry);
});
test('API authorization failures notify mounted maps', async () => {
  const { load, window, events } = loader();
  const pending = load('key');
  window.gm_authFailure();
  await assert.rejects(pending, /authorize/);
  assert.equal(events[0].type, 'movezw-google-maps-auth-error');
});
test('a stalled loader times out and removes its script', async () => {
  const { load, scripts, timers } = loader();
  const pending = load('key');
  [...timers.values()][0]();
  await assert.rejects(pending, /too long/);
  assert.equal(scripts[0].removed, true);
});
