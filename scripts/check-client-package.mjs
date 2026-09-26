import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const root = resolve(process.argv[2] || '');
const freePort = async () => {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(done => server.close(done)); return port;
};
assert.equal(JSON.parse(await readFile(join(root, 'edition.json'), 'utf8')).id, 'client');
for (const item of ['qq', 'public_bot', 'data', 'official-bot.json']) assert.equal(existsSync(join(root, item)), false, `${item} should not ship`);
const directory = await mkdtemp(join(tmpdir(), 'zzz-client-package-'));
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const node = join(root, 'runtime', 'node.exe');
let errors = '';
const child = spawn(node, [join(root, 'server', 'index.mjs')], { cwd: root, env: { ...process.env, PORT: String(port), QUEUE_DATA_DIR: directory, QUEUE_DISABLE_BRIDGE: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
child.stderr.on('data', chunk => { errors += chunk; });
try {
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw Error(errors || 'Client server exited'); })]);
  const reader = (await fetch(`${base}/api/events?admin=1`)).body.getReader();
  const state = await reader.read();
  assert.ok(state.value?.length);
  await reader.cancel();
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.version, JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version);
  const localBot = await fetch(`${base}/api/qq/message`, { method: 'POST' });
  assert.equal(localBot.status, 404);
  console.log(`Client package OK: ${root}`);
} finally {
  if (child.exitCode === null) { child.kill(); await once(child, 'exit').catch(() => {}); }
  await rm(directory, { recursive: true, force: true });
}
