import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('./index.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function worker({ expired = false, nativeFailure = false, approved = true } = {}) {
  let handler;
  const state = { completed: 0, pushed: [], claims: 0 };
  const client = {
    rpc(name) {
      if (name === 'authorize_driver_job_push') return Promise.resolve({ data: true });
      if (name === 'claim_driver_job_push_batch') { state.claims++; return Promise.resolve({ data: [{ request_id: 'job', attempts: 1 }] }); }
      return this.from('recipients');
    },
    from(table) {
      let update = false;
      const query = {
        select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; }, range() { return this; },
        update() { update = true; return this; },
        async single() { return { data: { id: 'job', status: 'open', expired_at: expired ? new Date().toISOString() : null, created_at: new Date().toISOString(), pickup_location: 'Harare', destination: 'Gweru', cargo_type: 'Boxes' } }; },
        then(resolve, reject) {
          if (table === 'driver_job_push_outbox' && update) state.completed++;
          const data = table === 'recipients' ? (approved ? [{ user_id: 'driver' }, { user_id: 'driver' }] : [])
            : table === 'driver_profiles' ? (approved ? [{ user_id: 'driver' }] : [])
            : table === 'profiles' ? [{ id: 'driver', is_suspended: false }] : [];
          return Promise.resolve({ data }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  vm.runInNewContext(code, {
    Deno: { env: { get: () => 'https://example.supabase.co' }, serve: (callback) => { handler = callback; } },
    createClient: () => client, corsHeaders: {}, initWebPush: () => ({ publicKey: 'public', privateKey: 'private' }),
    getServiceRoleKey: () => 'server-secret',
    sendPushToUsers: async (_client, ids) => { state.pushed.push(...ids); return ids.length; },
    verifyNativePushConfiguration: async () => true,
    sendNativePushToUsers: async () => { if (nativeFailure) throw new Error('FCM unavailable'); return 1; },
    Response, Date, Set, console: { error() {} },
  });
  return { handler, state };
}
const request = (token = 'dedicated-worker-credential-32-characters') => new Request('https://example.test', { method: 'POST', headers: { 'x-movezw-job-token': token } });

test('only a server-authorized request may claim job pushes', async () => {
  const { handler, state } = worker();
  assert.equal((await handler(request('user-token'))).status, 401);
  assert.equal(state.claims, 0);
});
test('duplicate recipients are sent once and a successful job is completed', async () => {
  const { handler, state } = worker();
  const response = await handler(request());
  assert.deepEqual(await response.json(), { completed: 1, retrying: 0 });
  assert.deepEqual(state.pushed, ['driver']);
  assert.equal(state.completed, 1);
});
test('a partial provider failure retains the job for retry', async () => {
  const { handler, state } = worker({ nativeFailure: true });
  assert.deepEqual(await (await handler(request())).json(), { completed: 0, retrying: 1 });
  assert.equal(state.completed, 0);
});
test('expired jobs are completed without sending stale pushes', async () => {
  const { handler, state } = worker({ expired: true });
  await handler(request());
  assert.equal(state.pushed.length, 0);
  assert.equal(state.completed, 1);
});
test('a driver who lost approval is excluded at delivery time', async () => {
  const { handler, state } = worker({ approved: false });
  await handler(request());
  assert.equal(state.pushed.length, 0);
});

test('authenticated health check verifies providers without claiming or sending jobs', async () => {
  const { handler, state } = worker();
  const req = new Request('https://example.test', { method: 'POST', headers: { 'x-movezw-job-token': 'dedicated-worker-credential-32-characters' }, body: JSON.stringify({ health: true }) });
  assert.deepEqual(await (await handler(req)).json(), { database: true, webConfigured: true, androidAuthenticated: true });
  assert.equal(state.claims, 0);
  assert.equal(state.pushed.length, 0);
});
