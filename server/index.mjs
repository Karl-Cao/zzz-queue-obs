import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defaults, action, event, finish, publicState, consolidateQueue, sorted, cancelQueue } from './core.mjs';
import { allowedHost, allowedPeer, createAccess, interfaces, loopback } from './network.mjs';
import { Bridge } from './bridge.mjs';
import { GiftCatalog } from './gifts.mjs';
import { ChatFeed } from './chat.mjs';
import {EventDiagnostics} from './event-diagnostics.mjs';
import { SystemSpeech } from './speech.mjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { addLaplaceDashboard } from './obs.mjs';
import { connectNapCat, qqStatus, restartQQ, saveOfficialCredentials, startQQ, stopQQ, syncQQConfig } from './qq.mjs';
import { PublicQQClient } from './public-qq.mjs';
import { QQIdentity } from './qq-identity.mjs';
import {loadIdentityStore,saveIdentityStore} from './qq-identity-store.mjs';
import { GuardRoster } from './guards.mjs';
import { callWords } from './call-words.mjs';
import { submitRedPacket } from './red-packets.mjs';
import { GameQr, extractLoginQr } from './game-qr.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = process.env.QUEUE_DATA_DIR || root + 'data';
const gameQr=await new GameQr(directory).load();
let gameQrBusy=false;
const port = Number(process.env.PORT || 3667);
const origin = `http://127.0.0.1:${port}`;
const version = JSON.parse(await readFile(root + 'package.json', 'utf8')).version;
let edition = { id: 'bridge', name: 'Event Bridge' };
try { edition = JSON.parse(await readFile(root + 'edition.json', 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const clientOnly = edition.id === 'client';
let s = defaults();
try { const saved = JSON.parse(await readFile(directory + '/state.json', 'utf8')); s = { ...s, ...saved, settings: { ...s.settings, ...saved.settings } }; }
catch (e) { if (e.code !== 'ENOENT') throw e; }
await loadIdentityStore(directory,s);
delete s.settings.lotteryGiftId;
delete s.settings.autoCall;
s.current ||= null;
s.undo=null;
consolidateQueue(s);
if (s.lottery) delete s.lottery.giftId;
s.settings.giftMinimum = Math.max(0.1, s.settings.giftMinimum);
if (!s.settings.qqToken) s.settings.qqToken = randomBytes(32).toString('hex');
const access = createAccess(), catalog = new GiftCatalog(directory), clients = new Map();
const eventDiagnostics=new EventDiagnostics();
const chat = new ChatFeed(), speech = new SystemSpeech(broadcast);
speech.lastId = s.announcement?.id;
const instance = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,16);
let chain = Promise.resolve();
const qqIdentity = new QQIdentity(s);
const guards = new GuardRoster(process.env.NODE_ENV==='test'&&process.env.QUEUE_BILI_API_ORIGIN?{apiOrigin:process.env.QUEUE_BILI_API_ORIGIN}:{});
const guardSyncEnabled=process.env.QUEUE_DISABLE_BRIDGE!=='1'||Boolean(process.env.NODE_ENV==='test'&&process.env.QUEUE_BILI_API_ORIGIN);
async function syncGuards(force=false) {
  const room=s.settings.roomId;if(!room)return;
  await guards.refresh(room,force);
  if(s.settings.roomId!==room)return;
  await mutate(()=>{for(const item of [...s.queue,...(s.current?[s.current]:[])])if(/^\d+$/.test(item.uid)&&!item.manual)item.guardType=guards.level(room,item.uid);});
}
const ingest = (e, manual=false) => { qqIdentity.state=s; if (eventDiagnostics.process(s,e,()=>event(s, e, Date.now(), manual))) { if(!manual)qqIdentity.observe(e,s.settings.roomId); chat.add(e, s.settings.roomId); } };
const bridge = new Bridge(() => s.settings, events => mutate(() => { for (const e of events) ingest(e); }), broadcast);
const localAdmin = req => loopback(req.socket.remoteAddress) && /^(127\.0\.0\.1|localhost):/.test(req.headers.host || '');
function snapshot(admin, local) {
  if (!admin) return { ...publicState(s), ...(s.settings.streamChat ? {chat:chat.items.slice(0,30).map(({uid, ...item})=>item)} : {}) };
  const settings = { ...s.settings }; if (!local) { delete settings.bridgeToken; delete settings.qqToken; }
  return { ...publicState(s), edition, runtime:{version,port,url:origin,...(local?{directory:root}:{})}, undo:s.undo&&s.undo.expiresAt>Date.now()?{id:s.undo.id,type:s.undo.type,expiresAt:s.undo.expiresAt}:null, settings, history: s.history, chat: chat.items, giftDiagnostics:eventDiagnostics.gifts, speech: speech.status, connection: bridge.status.detail, bridge: bridge.status,
    redPackets:(s.redPackets||[]).filter(x=>x.status==='pending'),guards:guards.status(s.settings.roomId),access: { local, urls: interfaces().map(x => `http://${x.address}:${port}`), ...(local ? { pairingCode: access.code } : {}) } };
}
function broadcast() {
  for (const [res, client] of clients) {
    if (client.admin && !access.authorized(client.req)) { res.write('event: auth-expired\ndata: {}\n\n'); res.end(); clients.delete(res); continue; }
    res.write(`data: ${JSON.stringify(snapshot(client.admin, client.local))}\n\n`);
  }
}
async function save() { await saveIdentityStore(directory,s); await mkdir(directory, { recursive: true }); await writeFile(directory + '/state.tmp', JSON.stringify(s)); await rename(directory + '/state.tmp', directory + '/state.json'); speech.configure(s.settings.systemTts); speech.announce(s.announcement); broadcast(); }
function mutate(fn) { const work = chain.then(async () => { const backup = structuredClone(s); try { await fn(); await save(); } catch (e) { s = backup; throw e; } }); chain = work.catch(() => {}); return work; }
const publicQQ = new PublicQQClient(directory, () => s.settings, async incoming => {
  if (s.settings.qqMode !== 'public' || !s.settings.qqEnabled || !s.settings.roomId || s.settings.qqGroupOpenId !== incoming.groupOpenId || !/^[a-f0-9]{64}$/.test(incoming.id || '') || !/^[A-Za-z0-9_-]{5,128}$/.test(incoming.memberOpenId || '')) throw Error('本地 QQ 群绑定或排队设置不匹配');
  qqIdentity.state=s;
  let bindingResult;
  if(['查看绑定','解绑B站'].includes(incoming.message)||/^绑定B站(?:\s+[1-9]\d{0,19})?$/.test(incoming.message)) {
    await mutate(()=>{qqIdentity.state=s;bindingResult=qqIdentity.command(incoming.groupOpenId,incoming.memberOpenId,incoming.message,s.settings.roomId);});
    return bindingResult;
  }
  const packetRequest=/^红包排队(?:\s|$)/.test(incoming.message);
  if (incoming.message !== s.settings.command&&incoming.message!=='取消排队'&&!packetRequest) return { ignored: true };
  const verified=qqIdentity.identity(incoming.groupOpenId,incoming.memberOpenId,s.settings.roomId);
  if(!verified)return {error:'请先 @机器人 /绑定B站，完成直播间短码验证并收到成功通知后，再使用群内排队。'};
  if(verified)verified.guardType=guards.level(s.settings.roomId,verified.uid);
  const name = String(verified?.name || incoming.name || '').trim().slice(0,80), uid = verified?.uid || `qq:${incoming.memberOpenId}`, messageId = incoming.id;
  if (!name) throw Error('QQ 昵称无效');
  if(incoming.message==='取消排队'){let result;await mutate(()=>{result=cancelQueue(s,uid);});return result;}
  if(packetRequest) {
    let result;
    await mutate(()=>{result=submitRedPacket(s,{id:incoming.id,uid,username:name,qqName:String(incoming.qqName||incoming.name||'').slice(0,80),memberOpenId:incoming.memberOpenId,groupOpenId:incoming.groupOpenId,roomId:s.settings.roomId,amount:incoming.message.slice('红包排队'.length).trim()});});
    const c=result.claim;
    const reply=c.status==='confirmed'?'此申请已确认入账，请勿重复申报同一红包。':c.status==='rejected'?'此申请已驳回。':`已申报红包 ¥${(c.cents/100).toFixed(2)}，等待主播核对；金额尚未入账。新入队者在队尾等待，已有名次保持不变。请勿重复申报同一个红包。`;
    return {reply,...(verified?{verifiedIdentity:{uid:verified.uid,name:verified.name}}:{})};
  }
  const key = `${s.settings.roomId}:message:qq:${s.settings.qqGroupId}:${messageId}`;
  const duplicate = s.seen.includes(key);
  if (!duplicate) await mutate(() => {
    if(verified)for(const item of [...s.queue,...(s.current?[s.current]:[])])if(item.uid===uid)item.guardType=verified.guardType;
    ingest({ source:'qq', type:'message', uid, username:name, guardType:verified?.guardType, message:s.settings.command, roomId:s.settings.roomId, id:`qq:${s.settings.qqGroupId}:${messageId}` });
  });
  const position = sorted(s).findIndex(x => x.uid === uid || x.username === name);
  return { queued: position >= 0, position: position >= 0 ? position + 1 : null, current: s.current?.uid === uid || s.current?.username === name, duplicate, ...(verified?{verifiedIdentity:{uid:verified.uid,name:verified.name}}:{}) };
});
let identitySyncBusy=false;
async function syncIdentities(){
 if(identitySyncBusy||s.settings.qqMode!=='public'||!s.settings.qqGroupOpenId||!publicQQ.config)return;
 identitySyncBusy=true;
 try{
  const group=s.settings.qqGroupOpenId,prefix=group+':';
  const bindings=Object.entries(s.qqIdentities||{}).filter(([key])=>key.startsWith(prefix)).map(([key,value])=>({memberOpenId:key.slice(prefix.length),...value}));
  const notices=(s.qqIdentityOutbox||[]).filter(x=>x.groupOpenId===group);
  const result=await publicQQ.syncIdentities(group,bindings,notices);
  if(result.delivered?.length)await mutate(()=>{s.qqIdentityOutbox=s.qqIdentityOutbox.filter(x=>!result.delivered.includes(x.id));});
 }catch(error){publicQQ.lastIdentityError=error.message;}finally{identitySyncBusy=false;}
}
const identityTimer=setInterval(()=>void syncIdentities(),3000);
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
async function body(req, limit = 65536) { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > limit) throw Error('请求过大'); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
const files = { '/': 'index.html', '/live': 'index.html', '/overlay': 'index.html', '/chat-overlay': 'index.html', '/queue-overlay.js': 'queue-overlay.js', '/game-qr-ui.js':'game-qr-ui.js', '/app.js': 'app.js', '/style.css': 'style.css' };
let importing;
const server = createServer(async (req, res) => {
  try {
    if (!allowedPeer(req.socket.remoteAddress) || !allowedHost(req.headers.host, port)) { json(res, 403, { error: '只允许本机和同一局域网访问' }); return; }
    const url = new URL(req.url, origin), local = localAdmin(req), authorized = access.authorized(req);
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    if (req.method === 'GET' && url.pathname === '/api/access') { json(res, 200, { authorized, local }); return; }
    if (req.method === 'GET' && url.pathname === '/api/health') { json(res, 200, { app: 'obs-viewer-queue', version, instance, port, bridge: bridge.status.state, lastEventAt: bridge.status.lastEventAt }); return; }
    if (req.method === 'GET' && url.pathname === '/api/qq/status') { if (!authorized) { json(res,401,{error:'请先配对'}); return; } json(res,200,clientOnly?{installed:false}:await qqStatus(root)); return; }
    if (req.method === 'GET' && url.pathname === '/api/public-qq/status') { if (!authorized) { json(res,401,{error:'请先配对'}); return; } json(res,200,await publicQQ.status()); return; }
    if(req.method==='GET'&&url.pathname==='/api/game-qr/status'){if(!authorized){json(res,401,{error:'请先配对'});return;}json(res,200,gameQr.status());return;}
    if(req.method==='GET'&&url.pathname==='/api/guards/status') {if(!authorized){json(res,401,{error:'请先配对'});return;}json(res,200,guards.status(s.settings.roomId));return;}
    if(req.method==='GET'&&url.pathname==='/api/instances'){
      if(!local){json(res,403,{error:'Local only'});return;}
      const found=[];let cursor=3667;
      await Promise.all(Array.from({length:10},async()=>{while(cursor<3767){const target=cursor++;if(target===port)continue;try{const r=await fetch(`http://127.0.0.1:${target}/api/health`,{signal:AbortSignal.timeout(250)});const x=await r.json();if(x.app==='obs-viewer-queue')found.push({port:target,version:x.version,url:`http://127.0.0.1:${target}`});}catch{}}}));
      json(res,200,{instances:found.sort((a,b)=>a.port-b.port),range:'3667–3766'});return;
    }
    if (req.method === 'POST' && url.pathname === '/api/qq/message') {
      if (clientOnly) { json(res,404,{error:'Client build does not host a QQ bot'}); return; }
      if (!loopback(req.socket.remoteAddress) || s.settings.qqMode !== 'direct' || !s.settings.qqEnabled || !s.settings.roomId || !req.headers['content-type']?.startsWith('application/json')) { json(res,403,{error:'QQ bridge unavailable'}); return; }
      const supplied = String(req.headers['x-queue-qq-token'] || '');
      const expected = Buffer.from(s.settings.qqToken), actual = Buffer.from(supplied);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { json(res,401,{error:'Invalid QQ bridge token'}); return; }
      const input = await body(req, 2048);
      const groupId=String(input.groupId||''), userId=String(input.userId||''), messageId=String(input.messageId||'');
      const name=String(input.name||'').trim(), message=String(input.message||'').trim();
      if(groupId!==s.settings.qqGroupId || !/^[A-Za-z0-9_-]{5,128}$/.test(userId) || !messageId || messageId.length>128 || !name || name.length>80 || (message!==s.settings.command&&message!=='取消排队')){json(res,400,{error:'Invalid QQ group message'});return;}
      const uid=`qq:${userId}`, key=`${s.settings.roomId}:message:qq:${groupId}:${messageId}`;
      const alreadySeen=s.seen.includes(key);
      if(message==='取消排队'){let result;await mutate(()=>{result=cancelQueue(s,uid);});json(res,200,{ok:true,...result});return;}
      if(!alreadySeen)await mutate(()=>ingest({source:'qq',type:'message',uid,username:name,message,roomId:s.settings.roomId,id:`qq:${groupId}:${messageId}`}));
      const position=sorted(s).findIndex(x=>x.uid===uid||x.username===name);
      json(res,200,{ok:true,duplicate:alreadySeen,queued:position>=0,position:position>=0?position+1:null,current:s.current?.uid===uid||s.current?.username===name});return;
    }
    if (req.method === 'POST') {
      if (req.headers.origin !== `http://${req.headers.host}` || !req.headers['content-type']?.startsWith('application/json')) { json(res, 403, { error: '请从控制台页面操作' }); return; }
      if (url.pathname === '/api/login') { const a = await body(req); res.setHeader('Set-Cookie', access.login(req.socket.remoteAddress, a.code)); json(res, 200, { ok: true }); return; }
      if (!authorized) { json(res, 401, { error: '请先输入电脑控制台上的配对码' }); return; }
      if(['/api/game-qr/sources','/api/game-qr/preview','/api/game-qr/config','/api/game-qr/test'].includes(url.pathname)){
        if(!local){json(res,403,{error:'游戏登录码来源只能在直播电脑上设置'});return;}
        const input=await body(req,4096);
        if(url.pathname.endsWith('/sources'))json(res,200,{sources:await gameQr.sources(input)});
        else if(url.pathname.endsWith('/preview'))json(res,200,{image:await gameQr.preview(input)});
        else if(url.pathname.endsWith('/config'))json(res,200,await gameQr.save(input));
        else{if(!gameQr.status().configured)throw Error('请先保存来源和二维码区域');const image=await gameQr.preview({sourceName:gameQr.config.sourceName});json(res,200,{image:extractLoginQr(image,gameQr.config.crop)});}
        return;
      }
      if(url.pathname==='/api/game-qr/capture'){
        const input=await body(req,1024);
        if(!['advance','current'].includes(input.intent))throw Error('登录码操作无效');
        if(!publicQQ.config||s.settings.qqMode!=='public'||!s.settings.qqGroupOpenId)throw Error('请先连接公共机器人并绑定目标群');
        json(res,200,await gameQr.capture(input.intent,{current:structuredClone(s.current),queue:structuredClone(sorted(s))}));return;
      }
      if(url.pathname==='/api/game-qr/send'){
        if(gameQrBusy){json(res,409,{error:'正在叫号或发送登录码，请稍后再试'});return;}
        const input=await body(req,1024),intent=input.intent;
        if(!['advance','current'].includes(intent))throw Error('登录码操作无效');
        if(!publicQQ.config||s.settings.qqMode!=='public'||!s.settings.qqGroupOpenId)throw Error('请先连接公共机器人并绑定目标群');
        gameQrBusy=true;
        try{
          let qr,announcement,current,observedAnnouncementId;const boundGroup=s.settings.qqGroupOpenId;
          await mutate(()=>{
            qr=gameQr.consume(input.token,intent,{current:s.current,queue:sorted(s)});
            if(intent==='advance')action(s,{type:'advance',currentUid:s.current?.uid||null,nextUid:sorted(s)[0]?.uid||null});
            const announcementState={...s};
            if(!s.announcement||s.announcement.uid!==s.current?.uid)action(announcementState,{type:'call'});
            announcement=structuredClone(announcementState.announcement);current=structuredClone(s.current);
            observedAnnouncementId=s.announcement?.id??null;
          });
          try{
            await publicQQ.announce(announcement,current);
            if((s.announcement?.id??null)!==observedAnnouncementId||s.current?.uid!==current.uid||s.settings.qqGroupOpenId!==boundGroup)throw Error('叫号或绑定群已变化，已停止发送登录码');
            await publicQQ.sendGameQr(announcement,current,qr,input.token,intent==='current');
            json(res,200,{ok:true,called:intent==='advance',sent:true});
          }catch(error){json(res,200,{ok:true,called:intent==='advance',sent:false,error:error.message});}
        }finally{gameQrBusy=false;}
        return;
      }
      if(url.pathname==='/api/guards/refresh') {if(!local){json(res,403,{error:'只能从直播电脑刷新舰队名单'});return;}await body(req);await syncGuards(true);json(res,200,guards.status(s.settings.roomId));return;}
      if (url.pathname === '/api/public-qq/pair') {
        if (!local) { json(res,403,{error:'只能在直播电脑连接公共机器人'}); return; }
        const input = await body(req,2048);
        if (!s.settings.qqEnabled || !s.settings.qqGroupId || !s.settings.roomId) { json(res,409,{error:'请先设置直播间、QQ 群号并启用 QQ 排队'}); return; }
        const pairing = await publicQQ.pair(String(input.url || ''));
        await mutate(() => { s.settings.qqMode = 'public'; s.settings.qqGroupOpenId = ''; });
        if (!clientOnly && directory === root + 'data') await stopQQ(root);
        json(res,200,pairing); return;
      }
      if (url.pathname === '/api/public-qq/confirm') {
        if (!local) { json(res,403,{error:'只能在直播电脑确认 QQ 群'}); return; }
        const input = await body(req,2048);
        const bound = await publicQQ.confirmGroup(String(input.groupOpenId || ''));
        await mutate(() => { s.settings.qqGroupOpenId = bound.groupOpenId; });
        json(res,200,{ok:true,groupOpenId:bound.groupOpenId}); return;
      }
      if (url.pathname === '/api/public-qq/disconnect') {
        if (!local) { json(res,403,{error:'只能在直播电脑解除公共机器人连接'}); return; }
        await body(req,2048);
        await publicQQ.disconnect();
        await mutate(() => { s.settings.qqMode = 'direct'; s.settings.qqGroupOpenId = ''; });
        json(res,200,{ok:true}); return;
      }
      if (url.pathname === '/api/qq/credentials') {
        if (clientOnly) { json(res,404,{error:'Client build does not host a QQ bot'}); return; }
        if (!local) { json(res,403,{error:'只能在直播电脑填写 QQ 机器人凭据'}); return; }
        json(res,200,await saveOfficialCredentials(root,await body(req,2048))); return;
      }
      if (url.pathname === '/api/qq/bind-group') {
        if (clientOnly) { json(res,404,{error:'Client build does not host a QQ bot'}); return; }
        if (!local) { json(res,403,{error:'只能在直播电脑绑定 QQ 群'}); return; }
        const input = await body(req,2048), openid = String(input.openid || '');
        const observed = (await qqStatus(root)).observedGroups;
        if (!s.settings.qqGroupId || !observed.some(group => group.openid === openid)) { json(res,400,{error:'请先在目标 QQ 群真正 @机器人发送“排队”'}); return; }
        await mutate(() => { s.settings.qqGroupOpenId = openid; });
        await syncQQConfig(directory,s.settings,port);
        json(res,200,{ok:true}); return;
      }
      if (url.pathname === '/api/qq/start' || url.pathname === '/api/qq/restart' || url.pathname === '/api/qq/connect-napcat') {
        if (clientOnly) { json(res,404,{error:'Client build does not host a QQ bot'}); return; }
        if (!local) { json(res,403,{error:'只能从直播电脑管理 QQ 机器人'}); return; }
        if (s.settings.qqMode === 'public') { json(res,409,{error:'当前使用公共机器人；请先解除连接再启动本地 QQ 服务'}); return; }
        await body(req);
        json(res,200,url.pathname.endsWith('/start')?await startQQ(root):url.pathname.endsWith('/restart')?await restartQQ(root):await connectNapCat(root)); return;
      }
      if (url.pathname === '/api/obs/add-dashboard') {
        if (!local) { json(res, 403, { error: '一键添加只能在直播电脑的控制台使用' }); return; }
        const input = await body(req, 16 * 1024);
        const obsPort = Number(input.port || 4455);
        if (!Number.isInteger(obsPort) || obsPort < 1 || obsPort > 65535) { json(res, 400, { error: 'OBS WebSocket 端口无效' }); return; }
        let dashboard;
        try { dashboard = new URL(input.url); } catch { json(res, 400, { error: '请粘贴 LAPLACE Dashboard 完整地址' }); return; }
        if (dashboard.protocol !== 'https:' || dashboard.hostname !== 'chat.laplace.live' || !/^\/dashboard\/\d+$/.test(dashboard.pathname) || dashboard.hash) {
          json(res, 400, { error: '地址必须是 https://chat.laplace.live/dashboard/房间号' }); return;
        }
        if (typeof input.password !== 'string' || input.password.length > 1024) { json(res, 400, { error: 'OBS WebSocket 密码无效' }); return; }
        const result = await addLaplaceDashboard({ port: obsPort, password: input.password, url: dashboard.href });
        json(res, 200, { ok: true, ...result }); return;
      }
      if (url.pathname === '/api/speech/test') {
        await body(req);
        if (!s.settings.systemTts || !speech.status.ready) { json(res,409,{error:'请先在控制台启用电脑后台 TTS，等待语音就绪'}); return; }
        speech.announce({id:'test-'+Date.now(),text:callWords(s.settings.voiceCallTemplate,{username:s.settings.speechLanguage==='en-US'?'Test viewer':'测试观众',uid:'test'},s.settings.speechLanguage),language:s.settings.speechLanguage});
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
        const previousAnnouncement = s.announcement?.id;
        if (a.type === 'settings' && a.settings) { delete a.settings.qqMode; delete a.settings.qqGroupOpenId; if (!local) { delete a.settings.bridgeToken; delete a.settings.qqToken; } }
        await mutate(() => {
          if(a.type==='red-confirm') {
            const claim=s.redPackets?.find(x=>x.id===a.id);
            if(!claim||claim.groupOpenId!==s.settings.qqGroupOpenId)throw Error('红包申请不存在或不属于当前绑定的群');
            qqIdentity.state=s;
            const bound=qqIdentity.identity(claim.groupOpenId,claim.memberOpenId,s.settings.roomId);
            a.identity={uid:bound?.uid||`qq:${claim.memberOpenId}`,username:bound?.name||claim.username,guardType:bound?guards.level(s.settings.roomId,bound.uid):0,verified:Boolean(bound)};
          }
          if (url.pathname === '/api/mock') ingest(a,true); else action(s, a); if (s.settings.roomId !== previousRoom) chat.clear();
        });
        if(guardSyncEnabled&&s.settings.roomId!==previousRoom)void syncGuards(true).catch(console.error);
        if (url.pathname === '/api/action' && ['advance','select-call','call'].includes(a.type) && s.announcement?.id !== previousAnnouncement && s.current && s.settings.qqMode === 'public' && s.settings.qqGroupOpenId) {
          void publicQQ.announce(s.announcement, s.current).catch(error => console.error(`QQ群叫号未发送：${error.message}`));
        }
        if (!clientOnly && url.pathname === '/api/action' && a.type === 'settings') await syncQQConfig(directory, s.settings, port);
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
const guardTimer=setInterval(()=>{if(guardSyncEnabled)void syncGuards().catch(console.error);},60000);
server.listen(port, '0.0.0.0', async () => { await mkdir(directory, { recursive: true }); await writeFile(directory + '/runtime.json', JSON.stringify({ port, pid: process.pid, instance })); if (!clientOnly) await syncQQConfig(directory, s.settings, port); await publicQQ.load(); if(guardSyncEnabled)void syncGuards().catch(console.error); void syncIdentities(); console.log(`排队控制台 ${origin}\nOBS 浏览器源 ${origin}/overlay\n手机/平板 ${interfaces().map(x => `http://${x.address}:${port}/live`).join(' ')}\n配对码请在电脑控制台查看`); speech.configure(s.settings.systemTts); if (process.env.QUEUE_DISABLE_BRIDGE !== '1') { bridge.connect(); } });
function shutdown() { clearInterval(identityTimer); clearInterval(drawTimer); clearInterval(heartbeat); clearInterval(guardTimer); publicQQ.stop(); bridge.close(); speech.close(); for (const res of clients.keys()) res.end(); server.close(); chain.finally(() => process.exit()); }
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请使用 start.cmd 自动选择可用端口` : e.message); shutdown(); });
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

