import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicRelay } from '../public_bot/relay-core.mjs';
test('nickname binding is removed, including empty and nickname commands', async () => {
 const relay = new PublicRelay('unused');
 for (const command of ['绑定B站','绑定B站 小明','查看绑定'])
  await assert.rejects(relay.viewerBinding('group-A','member-A',command), /昵称绑定已取消.*\/绑定B站/);
});
