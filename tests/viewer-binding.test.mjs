import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PublicRelay } from '../public_bot/relay-core.mjs';

test('viewer bindings persist per group, survive QQ renames and drive queue names and mentions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zzz-viewer-bind-'));
  const relay = new PublicRelay(directory);
  const token = 'a'.repeat(64);
  try {
    await relay.register({ id: 'client-A', token, code: 'ABCDEFGHJK' });
    const client = relay.clients.get('client-A'); client.groupOpenId = 'group-A';
    await relay.rememberMember('group-A', 'member-A', 'QQ昵称');
    await relay.viewerBinding('group-A', 'member-A', '绑定B站 B站昵称');
    await assert.rejects(relay.viewerBinding('group-A', 'member-B', '绑定B站 B站昵称'), /已被/);
    await assert.rejects(relay.viewerBinding('group-B', 'member-A', '绑定B站 另一个'), /尚未绑定/);
    await assert.rejects(relay.viewerBinding('group-A', 'member-A', '绑定B站'), /请发送/);
    await relay.rememberMember('group-A', 'member-A', '新的QQ昵称');
    const loaded = await new PublicRelay(directory).load();
    assert.match(await loaded.viewerBinding('group-A', 'member-A', '查看绑定'), /B站昵称/);
    let sent;
    await loaded.announce('client-A', token, { announcementId:'announce-123', uid:'123456', name:'B站昵称' }, async payload => { sent=payload; });
    assert.equal(sent.memberOpenId, 'member-A');
    loaded.clients.get('client-A').lastPollAt=Date.now();
    const queued=loaded.queue('group-A','member-A','新的QQ昵称','message-1');
    const event=await loaded.poll('client-A',token);
    assert.equal(event.name,'B站昵称');
    loaded.ack('client-A',token,event.id,{queued:true}); await queued;
    await loaded.viewerBinding('group-A','member-A','解绑B站');
    assert.match(await loaded.viewerBinding('group-A','member-A','查看绑定'),/尚未绑定/);
  } finally { relay.shutdown(); await rm(directory,{recursive:true,force:true}); }
});
