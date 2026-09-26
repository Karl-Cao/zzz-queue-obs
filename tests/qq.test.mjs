import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveOfficialCredentials, syncQQConfig } from '../server/qq.mjs';
import { action, defaults } from '../server/core.mjs';

test('official bot secret stays in local data and is not returned to the console', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zzz-qq-'));
  try {
    const result = await saveOfficialCredentials(`${dir}/`, { appId: '123456789', secret: 'test-secret-not-a-real-key' });
    assert.deepEqual(result, { ok: true, appId: '123456789' });
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'data/qq-runtime/official-bot.json'), 'utf8')),
      { appId: '123456789', secret: 'test-secret-not-a-real-key' });
    await assert.rejects(() => saveOfficialCredentials(`${dir}/`, { appId: 'bad', secret: 'invalid' }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('QQ queue bridge follows the configured local queue port and group', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zzz-qq-'));
  try {
    await syncQQConfig(dir, { qqGroupId: '168426621', qqGroupOpenId: 'group-open-id', qqToken: 'local-test-token' }, 3766);
    const config = JSON.parse(await readFile(join(dir, 'qq-runtime/gsuid_queue/settings.json'), 'utf8'));
    assert.deepEqual(config, {
      group_id: '168426621', group_openid: 'group-open-id', token: 'local-test-token', queue_url: 'http://127.0.0.1:3766/api/qq/message',
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('changing the numeric QQ group clears the official OpenID binding', () => {
  const state = defaults();
  state.settings.qqEnabled = true;
  state.settings.qqToken = 'x'.repeat(32);
  state.settings.qqGroupId = '168426621';
  state.settings.qqGroupOpenId = 'old-group-openid';
  action(state, { type: 'settings', settings: { qqGroupId: '927643163' } });
  assert.equal(state.settings.qqGroupOpenId, '');
});
