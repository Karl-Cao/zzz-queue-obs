import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createServer as httpServer } from 'node:http';
import { PublicRelay } from '../public_bot/relay-core.mjs';
import { createRelayServer } from '../public_bot/relay-server.mjs';
import { PublicQQClient, validateRelayUrl } from '../server/public-qq.mjs';

const botSecret = 'a'.repeat(48);
const freePort = async () => { const server = httpServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; };
const waitFor = async predicate => {
  for (let i = 0; i < 80; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw Error('Timed out waiting for local poll');
};

test('shared bot binds two streamers and routes each group to the right local queue', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zzz-public-qq-'));
  const relay = new PublicRelay(join(directory, 'relay'), { deliveryTimeoutMs: 2000 });
  const { server, url } = await createRelayServer({ relay, botSecret, listenPort: 0 });
  const bot = async (path, input) => {
    const response = await fetch(`${url}/bot/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    return { status: response.status, ...await response.json() };
  };
  const receivedA = [], receivedB = [];
  const settings = { qqMode: 'public' };
  const a = new PublicQQClient(join(directory, 'a'), () => settings, async event => { receivedA.push(event); return { queued: true, position: 1 }; });
  const b = new PublicQQClient(join(directory, 'b'), () => settings, async event => { receivedB.push(event); return { queued: true, position: 2 }; });
  let reloaded;
  try {
    const pairA = await a.pair(url), pairB = await b.pair(url);
    assert.match(pairA.code, /^[A-Z2-9]{10}$/);
    assert.equal((await bot('group', { groupOpenId: 'group-A', text: `/绑定群 ${pairA.code}` })).status, 404);
    assert.match((await bot('dm', { openid: 'owner-A', text: `/绑定 ${pairA.code}` })).reply, /已确认/);
    assert.match((await bot('dm', { openid: 'owner-B', text: `/绑定 ${pairB.code}` })).reply, /已确认/);
    assert.equal((await bot('group', { groupOpenId: 'group-A', groupId: '168426621', text: `/绑定群 ${pairA.code}` })).status, 200);
    assert.equal((await bot('group', { groupOpenId: 'group-B', groupId: '927643163', text: `/绑定群 ${pairB.code}` })).status, 200);
    assert.equal((await a.status()).pendingGroup.openid, 'group-A');
    await a.confirmGroup('group-A');
    await b.confirmGroup('group-B');
    await waitFor(() => relay.clients.get(a.config.id).lastPollAt && relay.clients.get(b.config.id).lastPollAt);
    assert.equal((await bot('group', {groupOpenId:'group-A',memberOpenId:'member-A',text:'排队'})).reply,null);
    assert.equal((await bot('dm', {openid:'owner-A',text:'绑定 ABCDEFGHJK'})).reply,null);
    for (const text of ['/绑定B站','/绑定B站 小明']) {
      const invalidBinding=await bot('group',{groupOpenId:'group-A',memberOpenId:'member-A',text});
      assert.match(invalidBinding.reply,/B站UID.*纯数字/);
      assert.doesNotMatch(invalidBinding.reply,/你的Bilibili昵称/);
    }
    const first = await bot('group', { groupOpenId: 'group-A', memberOpenId: 'member-A', name: '观众A', messageId: 'message-A', text: '/排队' });
    const second = await bot('group', { groupOpenId: 'group-B', memberOpenId: 'member-B', name: '观众B', messageId: 'message-B', text: '/排队' });
    assert.match(first.reply, /第 1 位/);
    assert.match(second.reply, /第 2 位/);
    assert.deepEqual(receivedA.map(event => event.memberOpenId), ['member-A']);
    assert.deepEqual(receivedB.map(event => event.memberOpenId), ['member-B']);
    assert.match((await bot('group', { groupOpenId: 'unbound-group', memberOpenId: 'member-C', name: '观众C', messageId: 'message-C', text: '/排队' })).reply, /尚未绑定/);
    assert.equal((await bot('group', { groupOpenId: 'group-A', text: `/绑定群 ${pairB.code}` })).status, 404);
    const invalid = await fetch(`${url}/client/status`, { method: 'POST', headers: { 'X-Queue-Client-Id': a.config.id, Authorization: 'Bearer ' + 'b'.repeat(64), 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(invalid.status, 401);
    a.stop();
    reloaded = new PublicQQClient(join(directory, 'a'), () => settings, async event => { receivedA.push(event); return { queued: true, position: 3 }; });
    await reloaded.load();
    assert.equal(reloaded.config.id, a.config.id);
    await waitFor(() => relay.waiters.has(a.config.id));
    const afterRestart = await bot('group', { groupOpenId: 'group-A', memberOpenId: 'member-D', name: '观众D', messageId: 'message-D', text: '/排队' });
    assert.match(afterRestart.reply, /第 3 位/);
  } finally {
    a.stop(); b.stop(); reloaded?.stop();
    relay.shutdown();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('public relay requires HTTPS except for local testing', () => {
  assert.equal(validateRelayUrl('https://queue.example.com/'), 'https://queue.example.com');
  assert.equal(validateRelayUrl('http://127.0.0.1:8787/'), 'http://127.0.0.1:8787');
  assert.throws(() => validateRelayUrl('http://queue.example.com/'));
  assert.throws(() => validateRelayUrl('https://user:pass@queue.example.com/'));
  assert.throws(() => validateRelayUrl('https://queue.example.com/other'));
});

test('public registration is rate limited before allocating more client records', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zzz-public-limit-'));
  const relay = new PublicRelay(directory);
  const { server, url } = await createRelayServer({ relay, botSecret, listenPort: 0 });
  try {
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const response = await fetch(`${url}/client/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Queue-Client-Id': `client-${i}`, Authorization: 'Bearer ' + String(i).repeat(64) },
        body: JSON.stringify({ code: 'ABCDEFGH23' }),
      });
      statuses.push(response.status);
    }
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
    assert.equal(relay.clients.size, 5);
  } finally {
    relay.shutdown();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('shared bot calls only the bound group and mentions a uniquely known member', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zzz-public-calls-'));
  const calls = [];
  const relay = new PublicRelay(directory);
  const { server, url } = await createRelayServer({ relay, botSecret, listenPort: 0, sendCall: async payload => { calls.push(payload); } });
  const headers = (id, token) => ({ 'Content-Type': 'application/json', 'X-Queue-Client-Id': id, Authorization: `Bearer ${token}` });
  const send = async (path, input, customHeaders) => {
    const response = await fetch(`${url}${path}`, { method: 'POST', headers: customHeaders, body: JSON.stringify(input) });
    return { status: response.status, ...await response.json() };
  };
  try {
    const clients = [
      { id: 'streamer-a', token: 'a'.repeat(64), group: 'group-A', code: 'ABCDEFGH23', owner: 'owner-A' },
      { id: 'streamer-b', token: 'b'.repeat(64), group: 'group-B', code: 'ABCDEFGH24', owner: 'owner-B' },
    ];
    for (const c of clients) {
      await send('/client/register', { code: c.code }, headers(c.id, c.token));
      await send('/bot/dm', { openid: c.owner, text: `/绑定 ${c.code}` }, { 'Content-Type': 'application/json', Authorization: `Bearer ${botSecret}` });
      await send('/bot/group', { groupOpenId: c.group, groupId: c.group, text: `/绑定群 ${c.code}` }, { 'Content-Type': 'application/json', Authorization: `Bearer ${botSecret}` });
      await send('/client/confirm-group', { groupOpenId: c.group }, headers(c.id, c.token));
    }
    const botHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${botSecret}` };
    await send('/bot/group', { groupOpenId: 'group-A', memberOpenId: 'member-A', name: '同名观众', messageId: 'seen-A', text: '/zzz帮助' }, botHeaders);
    await send('/bot/group', { groupOpenId: 'group-B', memberOpenId: 'member-B', name: '同名观众', messageId: 'seen-B', text: '/zzz帮助' }, botHeaders);
    const first = await send('/client/announce', { announcementId: 'announcement-1', uid: 'bili:123', name: '同名观众' }, headers(clients[0].id, clients[0].token));
    assert.equal(first.mentioned, true);
    assert.deepEqual(calls, [{ groupOpenId: 'group-A', memberOpenId: 'member-A', name: '同名观众', mentioned: true }]);
    await send('/client/announce', { announcementId: 'announcement-1', uid: 'bili:123', name: '同名观众' }, headers(clients[0].id, clients[0].token));
    assert.equal(calls.length, 1);
    await send('/client/announce', { announcementId: 'announcement-2', uid: 'qq:member-B', name: '同名观众' }, headers(clients[1].id, clients[1].token));
    assert.equal(calls[1].groupOpenId, 'group-B');
    assert.equal(calls[1].memberOpenId, 'member-B');
    await send('/bot/group', { groupOpenId: 'group-A', memberOpenId: 'member-A2', name: '同名观众', messageId: 'seen-A2', text: '/zzz帮助' }, botHeaders);
    const ambiguous = await send('/client/announce', { announcementId: 'announcement-3', uid: 'bili:123', name: '同名观众' }, headers(clients[0].id, clients[0].token));
    assert.equal(ambiguous.mentioned, false);
    assert.equal(calls[2].memberOpenId, '');
  } finally {
    relay.shutdown(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('public QQ message reaches an isolated local queue with its configured phrase', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zzz-public-local-'));
  const relay = new PublicRelay(join(directory, 'relay'), { deliveryTimeoutMs: 3000 });
  const calls = [];
  const { server, url } = await createRelayServer({ relay, botSecret, listenPort: 0, sendCall: async payload => { calls.push(payload); } });
  const localPort = await freePort();
  let rosterTier=1;
  const liveBridge=httpServer((req,res)=>{
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify(req.url.startsWith('/room/')?{code:0,data:{uid:99,room_id:446277}}:{code:0,data:{info:{num:rosterTier?1:0,page:1},top3:rosterTier?[{uid:12345,username:'Verified viewer',guard_level:rosterTier}]:[],list:[]}}));
  });let liveSocket;
  liveBridge.on('upgrade',(req,socket)=>{
    liveSocket=socket;
    socket.on('error',()=>{});
    const accept=createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: client\r\n\r\n`);
  });
  liveBridge.listen(0,'127.0.0.1');await once(liveBridge,'listening');
  const emitLive=value=>{
    const data=Buffer.from(JSON.stringify(value)),head=Buffer.alloc(data.length<126?2:4);head[0]=0x81;head[1]=data.length<126?data.length:126;if(data.length>=126)head.writeUInt16BE(data.length,2);
    liveSocket.write(Buffer.concat([head,data]));
  };
  const local = `http://127.0.0.1:${localPort}`;
  const child = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, NODE_ENV:'test',QUEUE_BILI_API_ORIGIN:`http://127.0.0.1:${liveBridge.address().port}`,PORT: String(localPort), QUEUE_DATA_DIR: join(directory, 'queue'), QUEUE_DISABLE_BRIDGE: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const headers = { Origin: local, 'Content-Type': 'application/json' };
  const post = async (path, data) => {
    const response = await fetch(local + path, { method: 'POST', headers, body: JSON.stringify(data) });
    return { status: response.status, ...await response.json() };
  };
  const bot = async (path, data) => {
    const response = await fetch(`${url}/bot/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${botSecret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    return response.json();
  };
  try {
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw Error('Local queue exited'); })]);
    assert.equal((await post('/api/action', { type: 'settings', settings: { roomId: '446277', qqEnabled: true, qqGroupId: '168426621', command: '我要排队' } })).status, 200);
    const pair = await post('/api/public-qq/pair', { url });
    assert.match(pair.code, /^[A-Z2-9]{10}$/);
    assert.match((await bot('dm', { openid: 'owner-openid', text: `/绑定 ${pair.code}` })).reply, /已确认/);
    await bot('group', { groupOpenId: 'target-group', groupId: '168426621', text: `/绑定群 ${pair.code}` });
    assert.equal((await post('/api/public-qq/confirm', { groupOpenId: 'target-group' })).status, 200);
    await waitFor(async () => (await (await fetch(local + '/api/public-qq/status')).json()).groupOpenId === 'target-group');
    await waitFor(() => [...relay.clients.values()].some(client => client.lastPollAt));
    const ignored = await bot('group', { groupOpenId: 'target-group', memberOpenId: 'member-openid', name: '观众甲', messageId: 'ignored-id', text: '/排队' });
    assert.equal(ignored.reply, null);
    const joined = await bot('group', { groupOpenId: 'target-group', memberOpenId: 'member-openid', name: '观众甲', messageId: 'join-id', text: '/我要排队' });
    assert.match(joined.reply, /第 1 位/);
    const state = await (await fetch(local + '/api/state')).json();
    assert.equal(state.queue.length, 1);
    assert.equal(state.queue[0].uid, 'qq:member-openid');
    assert.equal((await post('/api/action', { type: 'advance', currentUid: null, nextUid: 'qq:member-openid' })).status, 200);
    await waitFor(() => calls.length === 1);
    assert.equal(calls[0].groupOpenId, 'target-group');
    assert.equal(calls[0].memberOpenId, 'member-openid');
    await post('/api/action',{type:'settings',settings:{bridgeUrl:`ws://127.0.0.1:${liveBridge.address().port}`,freeQueue:false,voiceCallTemplate:'Voice {name}',qqCallTemplate:'QQ {name}, ready!'}});
    await waitFor(async()=>(await (await fetch(local+'/api/guards/status')).json()).usable);
    await post('/api/bridge/reconnect',{});await waitFor(()=>Boolean(liveSocket));
    const bind=await bot('group',{groupOpenId:'target-group',memberOpenId:'verified-member',name:'QQ nickname',messageId:'bind-id',text:'/绑定B站 12345'});
    const code=/绑定QQ ([A-F0-9]{12})/.exec(bind.reply)?.[1];assert.ok(code);
    emitLive({type:'message',uid:'12345',username:'Verified viewer',roomId:'446277',message:`绑定QQ ${code}`,guardType:1});
    await waitFor(async()=> (await bot('group',{groupOpenId:'target-group',memberOpenId:'verified-member',name:'QQ nickname',messageId:'view-'+Date.now(),text:'/查看绑定'})).reply.includes('已验证 B站 UID'));
    const verifiedJoin=await bot('group',{groupOpenId:'target-group',memberOpenId:'verified-member',name:'QQ nickname',messageId:'verified-join',text:'/我要排队'});
    assert.match(verifiedJoin.reply,/第 1 位/);
    const verifiedState=await (await fetch(local+'/api/state')).json();
    assert.equal(verifiedState.queue[0].uid,'12345');assert.equal(verifiedState.queue[0].guardType,1);
    await post('/api/action',{type:'advance',currentUid:'qq:member-openid',nextUid:'12345'});
    await waitFor(()=>calls.length===2);assert.equal(calls[1].memberOpenId,'verified-member');
    assert.equal(calls[1].text,'QQ Verified viewer, ready!');
    assert.equal((await (await fetch(local+'/api/state')).json()).announcement.text,'Voice Verified viewer');
    rosterTier=0;
    assert.equal((await post('/api/guards/refresh',{})).count,0);
    assert.equal((await (await fetch(local+'/api/state')).json()).current.guardType,0);
    await post('/api/action',{type:'advance',currentUid:'12345',nextUid:null});
    const expiredJoin=await bot('group',{groupOpenId:'target-group',memberOpenId:'verified-member',name:'QQ nickname',messageId:'expired-join',text:'/我要排队'});
    assert.match(expiredJoin.reply,/未入队/);
    const requestData={groupOpenId:'target-group',memberOpenId:'verified-member',name:'QQ nickname',messageId:'red-packet-1',text:'/红包排队 100.00'};
    assert.match((await bot('group',requestData)).reply,/等待主播核对/);
    const pendingState=await (await fetch(local+'/api/state')).json();
    assert.equal(pendingState.queue[0].pendingRedPacket,true);assert.equal(pendingState.queue[0].cents,0);
    const claimId=pendingState.queue[0].claimId;
    assert.equal((await post('/api/action',{type:'advance',currentUid:null,nextUid:null})).status,200);
    assert.equal((await post('/api/action',{type:'red-confirm',id:claimId,amount:'2.50'})).status,200);
    assert.equal((await post('/api/action',{type:'red-confirm',id:claimId})).status,400);
    assert.match((await bot('group',requestData)).reply,/已确认入账/);
    const creditedState=await (await fetch(local+'/api/state')).json();assert.equal(creditedState.queue[0].uid,'12345');assert.equal(creditedState.queue[0].cents,250);
    assert.equal(calls.length,2);
    assert.equal((await post('/api/public-qq/disconnect', {})).status, 200);
  } finally {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    liveSocket?.destroy();await new Promise(resolve=>liveBridge.close(resolve));
    relay.shutdown();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
