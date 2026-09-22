import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Bridge } from '../server/bridge.mjs';
import { interfaces } from '../server/network.mjs';

async function freePort() { const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
async function snapshot(base, headers = {}) { const abort = new AbortController(); const timeout = setTimeout(() => abort.abort(), 4000); try { const response = await fetch(base + '/api/events?admin=1', { headers, signal: abort.signal }); assert.equal(response.status, 200); const reader = response.body.getReader(); let text = ''; while (!text.includes('\n\n')) { const { value, done } = await reader.read(); if (done) throw Error('stream closed'); text += new TextDecoder().decode(value); } return JSON.parse(text.split('\n')[0].slice(6)); } finally { abort.abort(); clearTimeout(timeout); } }
test('服务集成：局域网配对、权限、模拟操作、礼物导入与持久化', { timeout: 15000 }, async () => {
  const port = await freePort(), directory = await mkdtemp(join(tmpdir(), 'obs-queue-test-'));
  const child = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(port), QUEUE_DATA_DIR: directory, QUEUE_DISABLE_BRIDGE: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let errors = ''; child.stderr.on('data', x => errors += x); const base = `http://127.0.0.1:${port}`;
  try {
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw Error(errors || 'server exited'); })]);
    const local = await snapshot(base); assert.equal(local.access.local, true); assert.match(local.access.pairingCode, /^\d{8}$/);
    assert.equal(local.settings.roomId, '');assert.equal(local.runtime.version,'1.10.0');assert.ok(local.runtime.directory);assert.equal((await (await fetch(base+'/api/state')).json()).runtime,undefined);
    const copies=await (await fetch(base+'/api/instances')).json();assert.ok(Array.isArray(copies.instances));assert.ok(copies.instances.every(x=>x.port!==port));
    await fetch(base + '/api/action', {method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({type:'settings',settings:{roomId:'446277'}})});
    const address = interfaces()[0]?.address;
    if (address) {
      const remote = `http://${address}:${port}`;
      assert.equal((await fetch(remote + '/api/events?admin=1')).status, 401);
      assert.equal((await fetch(remote + '/api/gifts')).status, 401);assert.equal((await fetch(remote+'/api/instances')).status,403);
      const headers = { Origin: remote, 'Content-Type': 'application/json' };
      assert.equal((await fetch(remote + '/api/action', { method: 'POST', headers, body: '{"type":"call"}' })).status, 401);
      const paired = await fetch(remote + '/api/login', { method: 'POST', headers, body: JSON.stringify({ code: local.access.pairingCode }) });
      assert.equal(paired.status, 200); headers.Cookie = paired.headers.get('set-cookie').split(';')[0];
      const phone = await snapshot(remote, headers); assert.equal(phone.access.local, false);assert.equal(phone.runtime.directory,undefined); assert.ok(!phone.access.pairingCode); assert.ok(!('bridgeToken' in phone.settings));
      const mock = await fetch(remote + '/api/mock', { method: 'POST', headers, body: JSON.stringify({ type: 'gift', uid: 'test', username: '测试', priceNormalized: 2, roomId: '446277', id: 'http-test' }) });
      assert.equal(mock.status, 200); const after = await snapshot(base); assert.equal(after.queue[0].cents, 200); assert.equal(after.chat[0].username,'测试');
      assert.equal((await fetch(remote + '/api/action', { method: 'POST', headers: { ...headers, Origin: 'http://evil.example' }, body: '{"type":"call"}' })).status, 403);
    }
    const imported = await fetch(base + '/api/gifts/import', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { list: [{ id: 99, name: '测试礼物', price: 1000, coin_type: 'gold' }] } }) });
    assert.equal(imported.status, 200); assert.equal((await imported.json()).gifts[0].yuan, 1);
    assert.equal(JSON.parse(await readFile(join(directory, 'gifts-446277.json'), 'utf8')).gifts.length, 1);
    assert.ok(!JSON.stringify(await (await fetch(base + '/api/state')).json()).includes(local.access.pairingCode));
    assert.equal('chat' in await (await fetch(base + '/api/state')).json(), false);
    const headers = {Origin:base,'Content-Type':'application/json'};
    await fetch(base+'/api/mock',{method:'POST',headers,body:JSON.stringify({type:'message',uid:'chat-test',username:'chat user',message:'hello',roomId:'446277',id:'chat-display-test'})});
    assert.ok((await (await fetch(base+'/api/desktop')).json()).chat.some(x=>x.message==='hello'));
    await fetch(base+'/api/action',{method:'POST',headers,body:JSON.stringify({type:'settings',settings:{streamChat:true}})});
    const visible=(await (await fetch(base+'/api/state')).json()).chat;assert.ok(visible.some(x=>x.message==='hello'));assert.ok(visible.every(x=>!('uid' in x)));
    await fetch(base+'/api/action',{method:'POST',headers,body:JSON.stringify({type:'settings',settings:{streamChat:false}})});
    assert.equal('chat' in await (await fetch(base+'/api/state')).json(),false);
    assert.ok((await (await fetch(base+'/api/desktop')).json()).chat.some(x=>x.message==='hello'));

  } finally { child.kill(); await once(child, 'exit'); }
});

test('桥接：握手消息不冒充弹幕、真实消息回调、应用心跳回复', { timeout: 8000 }, async () => {
  const server = createServer(); let socket; let gotPong = false; let resolveEvent;
  const received = new Promise(resolve => resolveEvent = resolve);
  const frame = text => { const data = Buffer.from(text); return Buffer.concat([Buffer.from([0x81, data.length]), data]); };
  server.on('upgrade', (req, raw) => {
    socket = raw; const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    raw.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: client\r\n\r\n`);
    raw.write(frame('{"type":"established","clientId":"test"}'));
    raw.write(frame('ping'));
    raw.on('data', data => { if ((data[0] & 15) !== 1) return; const length = data[1] & 127; const mask = data.subarray(2, 6); const content = Buffer.from(data.subarray(6, 6 + length)); for (let i = 0; i < content.length; i++) content[i] ^= mask[i % 4]; if (content.toString() === 'pong') { gotPong = true; raw.write(frame('{"type":"message","uid":"1","roomId":"446277","message":"排队"}')); } });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const events = [];
  const bridge = new Bridge(() => ({ bridgeUrl: `ws://127.0.0.1:${server.address().port}`, bridgeToken: '' }), xs => { events.push(...xs); resolveEvent(); }, () => {});
  try { await bridge.connect(); await received; assert.ok(gotPong); assert.equal(events.length, 1); assert.equal(events[0].type, 'message'); }
  finally { bridge.close(); socket?.destroy(); await new Promise(resolve => server.close(resolve)); }
});
