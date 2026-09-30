import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createServer as httpServer } from 'node:http';
import { PublicRelay } from '../public_bot/relay-core.mjs';
import { createRelayServer } from '../public_bot/relay-server.mjs';
import { PublicQQClient, validateRelayUrl } from '../server/public-qq.mjs';
import {extractLoginQr} from '../server/game-qr.mjs';

const botSecret = 'a'.repeat(48);
const freePort = async () => { const server = httpServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; };
const waitFor = async predicate => {
  for (let i = 0; i < 240; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw Error('Timed out waiting for local poll');
};

async function fakeObs(image) {
  const server=httpServer(),sockets=new Set();
  server.on('upgrade',(req,socket)=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
    const accept=createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const send=value=>{const bytes=Buffer.from(JSON.stringify(value)),head=Buffer.alloc(bytes.length<126?2:4);head[0]=129;head[1]=bytes.length<126?bytes.length:126;if(bytes.length>=126)head.writeUInt16BE(bytes.length,2);socket.write(Buffer.concat([head,bytes]));};
    let buffered=Buffer.alloc(0);
    socket.on('data',chunk=>{
      buffered=Buffer.concat([buffered,chunk]);
      while(buffered.length>=2){
        const opcode=buffered[0]&15,masked=Boolean(buffered[1]&128);let size=buffered[1]&127,offset=2;
        if(size===126){if(buffered.length<4)return;size=buffered.readUInt16BE(2);offset=4;}
        if(size===127){socket.destroy();return;}
        if(buffered.length<offset+(masked?4:0)+size)return;
        const mask=masked?buffered.subarray(offset,offset+4):null;offset+=masked?4:0;
        const data=Buffer.from(buffered.subarray(offset,offset+size));buffered=buffered.subarray(offset+size);
        if(mask)for(let i=0;i<data.length;i++)data[i]^=mask[i%4];
        if(opcode===8){socket.end();return;}if(opcode!==1)continue;
        const msg=JSON.parse(data.toString());
        if(msg.op===1)send({op:2,d:{negotiatedRpcVersion:1}});
        if(msg.op===6)send({op:7,d:{requestId:msg.d.requestId,requestStatus:{result:true,code:100},responseData:msg.d.requestType==='GetInputList'?{inputs:[{inputName:'Synthetic game',inputKind:'game_capture'}]}:{imageData:image}}});
      }
    });
    send({op:0,d:{rpcVersion:1}});
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  return {port:server.address().port,close:async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}

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
    assert.match((await bot('dm',{openid:'owner-A',text:'/帮助'})).reply,/群绑定\/解绑只在私聊/);
    assert.match((await bot('dm',{openid:'unknown-owner',text:'/查看群'})).reply,/尚未绑定群/);
    assert.match((await bot('group',{groupOpenId:'group-A',text:'/解绑群'})).reply,/只能私聊/);
    const help=await bot('group',{groupOpenId:'group-A',groupId:'168426621',text:'/帮助'});assert.match(help.reply,/本群接入码：G/);assert.equal((await a.status()).pendingGroup,null);
    assert.match((await bot('group', { groupOpenId: 'group-A', text: `/绑定群 ${pairA.code}` })).reply,/只能私聊/);
    assert.match((await bot('dm', { openid: 'owner-A', text: `/绑定 ${pairA.code}` })).reply, /已确认/);
    assert.match((await bot('dm', { openid: 'owner-B', text: `/绑定 ${pairB.code}` })).reply, /已确认/);
    assert.equal((await bot('dm', {openid:'owner-A',text:`/绑定群 ${relay.issueGroupAccess('group-A','168426621')} ${pairA.code}`})).status, 200);
    assert.equal((await bot('dm', {openid:'owner-B',text:`/绑定群 ${relay.issueGroupAccess('group-B','927643163')} ${pairB.code}`})).status, 200);
    assert.equal((await a.status()).pendingGroup.openid, 'group-A');
    assert.match((await bot('dm',{openid:'owner-A',text:'/查看群'})).reply,/待控制台确认/);
    await a.confirmGroup('group-A');
    assert.match((await bot('dm',{openid:'owner-A',text:'/查看群'})).reply,/168426621.*已绑定/);
    await b.confirmGroup('group-B');
    await waitFor(() => relay.clients.get(a.config.id).lastPollAt && relay.clients.get(b.config.id).lastPollAt);
    assert.equal((await bot('group', {groupOpenId:'group-A',memberOpenId:'member-A',text:'排队'})).reply,null);
    assert.equal((await bot('dm', {openid:'owner-A',text:'绑定 ABCDEFGHJK'})).reply,null);
    for (const text of ['/绑定B站 小明']) {
      const invalidBinding=await bot('group',{groupOpenId:'group-A',memberOpenId:'member-A',text});
      assert.match(invalidBinding.reply,/无需填写UID/);
      assert.doesNotMatch(invalidBinding.reply,/你的Bilibili昵称/);
    }
    const blocked=await bot('group',{groupOpenId:'group-A',memberOpenId:'unverified-member',name:'观众A',messageId:'blocked-id',text:'/排队'});
    assert.match(blocked.reply,/请先.*绑定B站/);assert.equal(receivedA.length,0);
    relay.clients.get(a.config.id).members=[{openid:'member-A',name:'观众A',bilibiliUid:'101',bilibiliName:'观众A'},{openid:'member-D',name:'观众D',bilibiliUid:'102',bilibiliName:'观众D'}];
    relay.clients.get(b.config.id).members=[{openid:'member-B',name:'观众B',bilibiliUid:'103',bilibiliName:'观众B'}];
    const first = await bot('group', { groupOpenId: 'group-A', memberOpenId: 'member-A', name: '观众A', messageId: 'message-A', text: '/排队' });
    const second = await bot('group', { groupOpenId: 'group-B', memberOpenId: 'member-B', name: '观众B', messageId: 'message-B', text: '/排队' });
    assert.match(first.reply, /第 1 位/);
    assert.match(second.reply, /第 2 位/);
    assert.deepEqual(receivedA.map(event => event.memberOpenId), ['member-A']);
    assert.deepEqual(receivedB.map(event => event.memberOpenId), ['member-B']);
    assert.match((await bot('group', { groupOpenId: 'unbound-group', memberOpenId: 'member-C', name: '观众C', messageId: 'message-C', text: '/排队' })).reply, /尚未绑定/);
    assert.match((await bot('group', { groupOpenId: 'group-A', text: `/绑定群 ${pairB.code}` })).reply,/只能私聊/);
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
  const calls = [], images=[];
  const relay = new PublicRelay(directory);
  const { server, url } = await createRelayServer({ relay, botSecret, listenPort: 0, sendCall: async payload => { calls.push(payload); },sendImage:async payload=>{images.push(payload);} });
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
      await send('/bot/dm', {openid:c.owner,text:`/绑定群 ${relay.issueGroupAccess(c.group,c.group)} ${c.code}`}, { 'Content-Type': 'application/json', Authorization: `Bearer ${botSecret}` });
      await send('/client/confirm-group', { groupOpenId: c.group }, headers(c.id, c.token));
    }
    const botHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${botSecret}` };
    await send('/bot/group', { groupOpenId: 'group-A', memberOpenId: 'member-A', name: '同名观众', messageId: 'seen-A', text: '/zzz帮助' }, botHeaders);
    await send('/bot/group', { groupOpenId: 'group-B', memberOpenId: 'member-B', name: '同名观众', messageId: 'seen-B', text: '/zzz帮助' }, botHeaders);
    const first = await send('/client/announce', { announcementId: 'announcement-1', uid: 'bili:123', name: '同名观众' }, headers(clients[0].id, clients[0].token));
    assert.equal(first.mentioned, true);
    assert.deepEqual(calls, [{ groupOpenId: 'group-A', memberOpenId: 'member-A', name: '同名观众', mentioned: true }]);
    const frame='data:image/png;base64,'+(await readFile(new URL('fixtures/game-login-qr.png',import.meta.url))).toString('base64');
    const image=extractLoginQr(frame,{x:.5,y:.2,width:.4,height:.65});
    const imageInput={announcementId:'announcement-1',uid:'bili:123',image,deliveryId:'delivery-001',groupOpenId:'group-B'};
    assert.equal((await send('/client/game-qr',imageInput,headers(clients[0].id,'f'.repeat(64)))).status,401);
    assert.equal((await send('/client/game-qr',imageInput,headers(clients[0].id,clients[0].token))).sent,true);
    assert.equal(images[0].groupOpenId,'group-A');
    assert.equal(images[0].memberOpenId,'member-A');
    assert.equal(images[0].image,image);
    await send('/client/game-qr',imageInput,headers(clients[0].id,clients[0].token));
    assert.equal(images.length,1);
    assert.equal((await send('/client/game-qr',{...imageInput,deliveryId:'delivery-002',uid:'someone-else'},headers(clients[0].id,clients[0].token))).status,409);
    assert.equal((await send('/client/game-qr',{...imageInput,deliveryId:'delivery-003',image:'data:image/png;base64,abcd'},headers(clients[0].id,clients[0].token))).status,400);
    await send('/client/announce', { announcementId: 'announcement-1', uid: 'bili:123', name: '同名观众' }, headers(clients[0].id, clients[0].token));
    assert.equal(calls.length, 1);
    await send('/client/announce', { announcementId: 'announcement-2', uid: 'qq:member-B', name: '同名观众' }, headers(clients[1].id, clients[1].token));
    assert.equal(calls[1].groupOpenId, 'group-B');
    assert.equal(calls[1].memberOpenId, 'member-B');
    await send('/bot/group', { groupOpenId: 'group-A', memberOpenId: 'member-A2', name: '同名观众', messageId: 'seen-A2', text: '/zzz帮助' }, botHeaders);
    const ambiguous = await send('/client/announce', { announcementId: 'announcement-3', uid: 'bili:123', name: '同名观众' }, headers(clients[0].id, clients[0].token));
    assert.equal(ambiguous.mentioned, false);
    assert.equal(calls[2].memberOpenId, '');
    assert.equal((await send('/client/game-qr',{...imageInput,deliveryId:'delivery-004'},headers(clients[0].id,clients[0].token))).status,409);
    assert.equal(images.length,1);
  } finally {
    relay.shutdown(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('public QQ message reaches an isolated local queue with its configured phrase', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zzz-public-local-'));
  const relay = new PublicRelay(join(directory, 'relay'), { deliveryTimeoutMs: 3000 });
  const calls = [],bindingNotices=[],images=[];let imageFailure=false;
  const { server, url } = await createRelayServer({ relay, botSecret, listenPort: 0, sendCall: async payload => { (payload.kind==='identity'?bindingNotices:calls).push(payload); },sendImage:async payload=>{if(imageFailure)throw Error('Synthetic delivery failure');images.push(payload);} });
  const fixture='data:image/png;base64,'+(await readFile(new URL('fixtures/game-login-qr.png',import.meta.url))).toString('base64');
  const obs=await fakeObs(fixture);
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
    await bot('dm',{openid:'owner-openid',text:`/绑定群 ${relay.issueGroupAccess('target-group','168426621')} ${pair.code}`});
    assert.equal((await post('/api/public-qq/confirm', { groupOpenId: 'target-group' })).status, 200);
    await waitFor(async () => (await (await fetch(local + '/api/public-qq/status')).json()).groupOpenId === 'target-group');
    await waitFor(() => [...relay.clients.values()].some(client => client.lastPollAt));
    const ignored = await bot('group', { groupOpenId: 'target-group', memberOpenId: 'member-openid', name: '观众甲', messageId: 'ignored-id', text: '/排队' });
    assert.match(ignored.reply,/请先.*绑定B站/);
    const joined = await bot('group', { groupOpenId: 'target-group', memberOpenId: 'member-openid', name: '观众甲', messageId: 'join-id', text: '/我要排队' });
    assert.match(joined.reply,/请先.*绑定B站/);
    assert.match((await bot('group',{groupOpenId:'target-group',memberOpenId:'member-openid',name:'观众甲',messageId:'unbound-red',text:'/红包排队 10'})).reply,/请先.*绑定B站/);
    relay.clients.values().next().value.members.find(m=>m.openid==='member-openid').bilibiliUid='999';
    assert.match((await bot('group',{groupOpenId:'target-group',memberOpenId:'member-openid',messageId:'stale-cache',text:'/我要排队'})).reply,/请先.*绑定B站/);
    const state=await(await fetch(local+'/api/state')).json();assert.equal(state.queue.length,0);assert.equal(calls.length,0);
    await post('/api/action',{type:'settings',settings:{bridgeUrl:`ws://127.0.0.1:${liveBridge.address().port}`,freeQueue:false,voiceCallTemplate:'Voice {name}',qqCallTemplate:'QQ {name}, ready!'}});
    await waitFor(async()=>(await (await fetch(local+'/api/guards/status')).json()).usable);
    await post('/api/bridge/reconnect',{});await waitFor(()=>Boolean(liveSocket));
    const bind=await bot('group',{groupOpenId:'target-group',memberOpenId:'verified-member',name:'QQ nickname',messageId:'bind-id',text:'/绑定B站'});
    const code=/绑定([0-9]{6})/.exec(bind.reply)?.[1];assert.ok(code);
    await post('/api/mock',{type:'message',uid:'12345',username:'Verified viewer',roomId:'446277',message:`绑定${code}`});
    assert.match((await bot('group',{groupOpenId:'target-group',memberOpenId:'verified-member',messageId:'manual-proof-check',text:'/查看绑定'})).reply,/验证尚未完成/);
    emitLive({type:'message',uid:'12345',username:'Verified viewer',roomId:'446277',message:`绑定${code}`,guardType:1});
    await waitFor(()=>bindingNotices.length===1);
    assert.equal(bindingNotices[0].memberOpenId,'verified-member');assert.match(bindingNotices[0].text,/验证成功/);
    assert.equal(relay.clients.values().next().value.members.find(m=>m.openid==='verified-member').bilibiliUid,'12345');
    const verifiedJoin=await bot('group',{groupOpenId:'target-group',memberOpenId:'verified-member',name:'QQ nickname',messageId:'verified-join',text:'/我要排队'});
    assert.match(verifiedJoin.reply,/第 1 位/);
    const verifiedState=await (await fetch(local+'/api/state')).json();
    assert.equal(verifiedState.queue[0].uid,'12345');assert.equal(verifiedState.queue[0].guardType,1);
    await post('/api/action',{type:'advance',currentUid:null,nextUid:'12345'});
    await waitFor(()=>calls.length===1);assert.equal(calls[0].memberOpenId,'verified-member');
    assert.equal(calls[0].text,'QQ Verified viewer, ready!');
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
    assert.equal(calls.length,1);
    const config={port:obs.port,password:'synthetic-secret',sourceName:'Synthetic game',crop:{x:0,y:0,width:.3,height:.3}};
    assert.equal((await post('/api/game-qr/config',config)).status,200);
    assert.equal((await post('/api/game-qr/capture',{intent:'advance'})).status,400);
    assert.equal((await(await fetch(local+'/api/state')).json()).current,null);
    assert.equal((await post('/api/game-qr/config',{...config,crop:{x:.5,y:.2,width:.4,height:.65}})).status,200);
    const safeStatus=await(await fetch(local+'/api/game-qr/status')).json();assert.equal(safeStatus.password,undefined);assert.equal(safeStatus.passwordSaved,true);
    const captured=await post('/api/game-qr/capture',{intent:'advance'});assert.ok(captured.token);
    imageFailure=true;
    const failedImage=await post('/api/game-qr/send',{intent:'advance',token:captured.token});
    assert.equal(failedImage.called,true);assert.equal(failedImage.sent,false);
    const calledState=await(await fetch(local+'/api/state')).json();assert.equal(calledState.current.uid,'12345');assert.equal(calledState.queue.length,0);
    imageFailure=false;
    const retry=await post('/api/game-qr/capture',{intent:'current'});
    assert.equal((await post('/api/game-qr/send',{intent:'current',token:retry.token})).sent,true);
    assert.equal(images.length,1);assert.equal(images[0].groupOpenId,'target-group');assert.equal(images[0].memberOpenId,'verified-member');
    assert.equal((await(await fetch(local+'/api/state')).json()).announcement.id,calledState.announcement.id);
    assert.equal((await post('/api/game-qr/send',{intent:'current',token:retry.token})).status,400);
    // Preserve the remaining red-packet regression steps by returning the viewer to waiting.
    assert.equal((await post('/api/mock',{type:'gift',uid:'synthetic-other',username:'Other',roomId:'446277',price:10,giftName:'Test gift',id:'synthetic-gift'})).status,200);
    assert.equal((await post('/api/action',{type:'select-call',uid:'synthetic-other',currentUid:'12345'})).status,200);
    const undoState=JSON.parse(await readFile(join(directory,'queue','state.json'),'utf8'));
    assert.equal((await post('/api/action',{type:'undo',id:undoState.undo.id})).status,200);
    assert.equal((await(await fetch(local+'/api/state')).json()).announcement,null);
    const silentRetry=await post('/api/game-qr/capture',{intent:'current'});
    assert.equal((await post('/api/game-qr/send',{intent:'current',token:silentRetry.token})).sent,true);
    assert.equal((await(await fetch(local+'/api/state')).json()).announcement,null);
    assert.equal((await post('/api/action',{type:'select-call',uid:'synthetic-other',currentUid:'12345'})).status,200);
    assert.match((await bot('group',{...requestData,messageId:'red-packet-2'})).reply,/等待主播核对/);
    assert.equal((await (await fetch(local+'/api/state')).json()).queue[0].hasPendingRedPacket,true);
    assert.match((await bot('group',{groupOpenId:'target-group',memberOpenId:'verified-member',messageId:'cancel-id',text:'/取消排队'})).reply,/已取消排队/);
    assert.equal((await (await fetch(local+'/api/state')).json()).queue.length,0);
    assert.match((await bot('group',{groupOpenId:'target-group',memberOpenId:'verified-member',messageId:'unbind-id',text:'/解绑B站'})).reply,/已解除/);
    assert.match((await bot('group',{groupOpenId:'target-group',memberOpenId:'verified-member',messageId:'after-unbind',text:'/我要排队'})).reply,/请先.*绑定B站/);
    assert.equal((await post('/api/public-qq/disconnect', {})).status, 200);
  } finally {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    liveSocket?.destroy();await new Promise(resolve=>liveBridge.close(resolve));
    await obs.close();
    relay.shutdown();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
