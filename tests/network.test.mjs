import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedHost, allowedPeer, createAccess } from '../server/network.mjs';
const nets = [{ address: '10.0.0.203', netmask: '255.255.255.0' }];
test('只允许本机地址和当前局域网网段', () => {
  assert.ok(allowedPeer('127.0.0.1', nets)); assert.ok(allowedPeer('10.0.0.25', nets));
  assert.ok(!allowedPeer('10.0.1.25', nets)); assert.ok(!allowedPeer('8.8.8.8', nets));
  assert.ok(allowedHost('10.0.0.203:3667', 3667, nets)); assert.ok(!allowedHost('evil.example:3667', 3667, nets));
});
test('远程配对码、会话与重启失效', () => {
  const a = createAccess(); const remote = { socket: { remoteAddress: '10.0.0.25' }, headers: { host: '10.0.0.203:3667' } };
  assert.equal(a.authorized(remote), false);
  assert.throws(() => a.login('10.0.0.25', 'bad'));
  remote.headers.cookie = a.login('10.0.0.25', a.code).split(';')[0];
  assert.ok(a.authorized(remote)); assert.equal(createAccess().authorized(remote), false);
  assert.equal(a.authorized({ socket: { remoteAddress: '10.0.0.25' }, headers: { host: 'localhost:3667' } }), false);
});
test('配对连续失败限流，不阻碍其他设备', () => {
  const a = createAccess(); for (let i = 0; i < 5; i++) assert.throws(() => a.login('10.0.0.25', 'bad'));
  assert.throws(() => a.login('10.0.0.25', a.code), e => e.status === 429);
  assert.match(a.login('10.0.0.26', a.code), /HttpOnly; SameSite=Strict/);
});
