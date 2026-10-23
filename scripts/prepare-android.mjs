import { loadEnv } from 'vite';
import { spawnSync } from 'node:child_process';

const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
  if (!env[key]?.trim()) throw new Error(`${key} is required before packaging Android. Configure .env.local or your build environment.`);
}
if (!/^https:\/\//.test(env.VITE_SUPABASE_URL)) throw new Error('Android requires an HTTPS Supabase URL.');
for (const [command, args] of [['npm', ['run', 'build']], ['npx', ['cap', 'sync', 'android']]]) {
  const result = spawnSync(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
