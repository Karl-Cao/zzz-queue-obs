import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defaults, action, event, finish, publicState } from './core.mjs';
import { allowedHost, allowedPeer, createAccess, interfaces, loopback } from './network.mjs';
import { Bridge } from './bridge.mjs';
import { GiftCatalog } from './gifts.mjs';
import { ChatFeed } from './chat.mjs';
import { SystemSpeech } from './speech.mjs';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = process.env.QUEUE_DATA_DIR || root + 'data';
const port = Number(process.env.PORT || 3667);
const origin = `http://127.0.0.1:${port}`;
const edition = { id: 'bridge', name: 'Event Bridge' };
let s = defaults();
try { const saved = JSON.parse(await readFile(directory + '/state.json', 'utf8')); s = { ...s, ...saved, settings: { ...s.settings, ...saved.settings } }; }
catch (e) { if (e.code !== 'ENOENT') throw e; }
delete s.settings.lotteryGiftId;
delete s.settings.autoCall;
s.current ||= null;
if (s.lottery) delete s.lottery.giftId;
s.settings.giftMinimum = Math.max(0.1, s.settings.giftMinimum);
const access = createAccess(), catalog = new GiftCatalog(directory), clients = new Map();
const chat = new ChatFeed(), speech = new SystemSpeech(broadcast);
speech.lastId = s.announcement?.id;
const instance = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,16);
let chain = Promise.resolve();
const ingest = e => { if (event(s, e)) chat.add(e, s.settings.roomId); };
const bridge = new Bridge(() => s.settings, events => mutate(() => { for (const e of events) ingest(e); }), broadcast);
const localAdmin = req => loopback(req.socket.remoteAddress) && /^(127\.0\.0\.1|localhost):/.test(req.headers.host || '');
function snapshot(admin, local) {
  if (!admin) return { ...publicState(s), ...(s.settings.streamChat ? {chat:chat.items.slice(0,30).map(({uid, ...item})=>item)} : {}) };
  const settings = { ...s.settings }; if (!local) delete settings.bridgeToken;
  return { ...publicState(s), edition, settings, history: s.history, chat: chat.items, speech: speech.status, connection: bridge.status.detail, bridge: bridge.status,
    access: { local, urls: interfaces().map(x => `http://${x.address}:${port}`), ...(local ? { pairingCode: access.code } : {}) } };
}
function broadcast() {
  for (const [res, client] of clients) {
    if (client.admin && !access.authorized(client.req)) { res.write('event: auth-expired\ndata: {}\n\n'); res.end(); clients.delete(res); continue; }
    res.write(`data: ${JSON.stringify(snapshot(client.admin, client.local))}\n\n`);
  }
}
async function save() { await mkdir(directory, { recursive: true }); await writeFile(directory + '/state.tmp', JSON.stringify(s)); await rename(directory + '/state.tmp', directory + '/state.json'); speech.configure(s.settings.systemTts); speech.announce(s.announcement); broadcast(); }
function mutate(fn) { const work = chain.then(async () => { const backup = structuredClone(s); try { await fn(); await save(); } catch (e) { s = backup; throw e; } }); chain = work.catch(() => {}); return work; }
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
async function body(req, limit = 65536) { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > limit) throw Error('请求过大'); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
const files = { '/': 'index.html', '/live': 'index.html', '/overlay': 'index.html', '/chat-overlay': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css' };
let importing;
const server = createServer(async (req, res) => {
  try {
    if (!allowedPeer(req.socket.remoteAddress) || !allowedHost(req.headers.host, port)) { json(res, 403, { error: '只允许本机和同一局域网访问' }); return; }
    const url = new URL(req.url, origin), local = localAdmin(req), authorized = access.authorized(req);
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    if (req.method === 'GET' && url.pathname === '/api/access') { json(res, 200, { authorized, local }); return; }
    if (req.method === 'GET' && url.pathname === '/api/health') { json(res, 200, { app: 'obs-viewer-queue', version: '1.5.0', instance, port }); return; }
    if (req.method === 'POST') {
      if (req.headers.origin !== `http://${req.headers.host}` || !req.headers['content-type']?.startsWith('application/json')) { json(res, 403, { error: '请从控制台页面操作' }); return; }
      if (url.pathname === '/api/login') { const a = await body(req); res.setHeader('Set-Cookie', access.login(req.socket.remoteAddress, a.code)); json(res, 200, { ok: true }); return; }
      if (!authorized) { json(res, 401, { error: '请先输入电脑控制台上的配对码' }); return; }
      if (url.pathname === '/api/speech/test') {
        await body(req);
        if (!s.settings.systemTts || !speech.status.ready) { json(res,409,{error:'请先在控制台启用电脑后台 TTS，等待语音就绪'}); return; }
        speech.announce({id:'test-'+Date.now(),text:s.settings.speechLanguage==='en-US'?'Queue voice test. It is the test viewer’s turn. Please get ready.':'排队语音测试。轮到测试观众了，请做好准备。'});
        json(res,200,{ok:true});return;
      }

      if (url.pathname === '/api/shutdown') { if (!local) { json(res, 403, { error: '只能从直播电脑停止服务' }); return; } json(res, 200, { ok: true }); setImmediate(shutdown); return; }
      if (url.pathname === '/api/bridge/reconnect') { bridge.connect(); json(res, 200, { ok: true }); return; }
      if (url.pathname === '/api/gifts/refresh' || url.pathname === '/api/gifts/import') {
        if (importing) { json(res, 409, { error: '礼物列表正在更新，请稍后再试' }); return; }
        const room = s.settings.roomId;
        const payload = url.pathname.endsWith('/import') ? await body(req, 8 * 1024 * 1024) : null;
        importing = payload ? catalog.import(room, payload) : catalog.refresh(room);
        try { json(res, 200, await importing); } finally { importing = null; } return;
      }
      if (url.pathname === '/api/action' || url.pathname === '/api/mock') {
        const a = await body(req), previous = s.settings.bridgeUrl + s.settings.bridgeToken, previousRoom = s.settings.roomId;
        if (!local && a.type === 'settings' && a.settings) delete a.settings.bridgeToken;
        await mutate(() => { if (url.pathname === '/api/mock') ingest(a); else action(s, a); if (s.settings.roomId !== previousRoom) chat.clear(); });
        if (previous !== s.settings.bridgeUrl + s.settings.bridgeToken) bridge.connect();
        json(res, 200, { ok: true }); return;
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/gifts') { if (!authorized) { json(res, 401, { error: '请先配对' }); return; } json(res, 200, await catalog.read(s.settings.roomId)); return; }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      const admin = url.searchParams.get('admin') === '1';
      if (admin && !authorized) { json(res, 401, { error: '请先配对' }); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
      clients.set(res, { admin, local, req }); res.write(`data: ${JSON.stringify(snapshot(admin, local))}\n\n`); req.on('close', () => clients.delete(res)); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/desktop') { if (!authorized) { json(res,401,{error:'请先配对'});return; } json(res,200,{...publicState(s),chat:chat.items.slice(0,30)});return; }
    if (req.method === 'GET' && url.pathname === '/api/state') { json(res, 200, snapshot(false)); return; }
    if (req.method === 'GET' && files[url.pathname]) { const f = files[url.pathname]; res.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript; charset=utf-8' : f.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8'); res.end(await readFile(root + 'public/' + f)); return; }
    json(res, 404, { error: 'Not found' });
  } catch (e) { if (!res.headersSent) json(res, e.status || 400, { error: e.message }); else res.end(); }
});
const drawTimer = setInterval(() => { if (s.lottery?.active && Date.now() >= s.lottery.endsAt) mutate(() => finish(s)).catch(console.error); }, 250);
const heartbeat = setInterval(broadcast, 15000);
server.listen(port, '0.0.0.0', async () => { await mkdir(directory, { recursive: true }); await writeFile(directory + '/runtime.json', JSON.stringify({ port, pid: process.pid, instance })); console.log(`排队控制台 ${origin}\nOBS 浏览器源 ${origin}/overlay\n手机/平板 ${interfaces().map(x => `http://${x.address}:${port}/live`).join(' ')}\n配对码请在电脑控制台查看`); speech.configure(s.settings.systemTts); if (process.env.QUEUE_DISABLE_BRIDGE !== '1') { bridge.connect(); } });
function shutdown() { clearInterval(drawTimer); clearInterval(heartbeat); bridge.close(); speech.close(); for (const res of clients.keys()) res.end(); server.close(); chain.finally(() => process.exit()); }
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请使用 start.cmd 自动选择可用端口` : e.message); shutdown(); });
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

