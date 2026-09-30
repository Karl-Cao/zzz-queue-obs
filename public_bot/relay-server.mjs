import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { PublicRelay } from './relay-core.mjs';

const directory = process.env.PUBLIC_QQ_DATA_DIR || fileURLToPath(new URL('./data/', import.meta.url));
const host = process.env.PUBLIC_QQ_HOST || '127.0.0.1';
const port = Number(process.env.PUBLIC_QQ_PORT || 8787);
const botToken = process.env.PUBLIC_QQ_BOT_TOKEN || '';

export async function createRelayServer({ relay = new PublicRelay(directory), botSecret = botToken, hostname = host, listenPort = port, sendCall = async payload => {
  const response = await fetch('http://127.0.0.1:18081/internal/queue-call', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botToken}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw Object.assign(Error(detail.detail || 'QQ 叫号发送失败'), { status: 502 });
  }
}, sendImage = async payload => {
  const response=await fetch('http://127.0.0.1:18081/internal/game-qr',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${botToken}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});
  if(!response.ok){const detail=await response.json().catch(()=>({}));throw Object.assign(Error(detail.detail||'QQ 登录码图片发送失败'),{status:502});}
} } = {}) {
  await relay.load();
  const registrations = new Map();
  const server = createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/health') { send(200, { ok: true, app: 'zzz-public-qq-relay' }); return; }
      if (req.method !== 'POST') { send(404, { error: 'Not found' }); return; }
      if (!req.headers['content-type']?.startsWith('application/json')) { send(415, { error: 'JSON required' }); return; }
      const chunks = []; let length = 0;
      for await (const chunk of req) { length += chunk.length; if (length > (url.pathname === '/client/game-qr' ? 360000 : url.pathname === '/client/identity-sync' ? 262144 : 4096)) throw Object.assign(Error('Request too large'), { status: 413 }); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const bearer = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1] || '';
      if (url.pathname.startsWith('/bot/')) {
        if (!botSecret || bearer !== botSecret || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) { send(403, { error: 'Bot only' }); return; }
        const raw = String(input.text || '').trim();
        if (!raw.startsWith('/')) { send(200, { reply: null }); return; }
        const content = raw.replace(/^\/\s*/, '');
        if (url.pathname === '/bot/dm') {
          if(content==='帮助'){send(200,{reply:'欢迎使用然神排队机器人。群绑定/解绑只在私聊操作。\n主播首次接入：\n1. 将机器人加入目标群，在群里真正 @机器人 /帮助 获取群接入码（仅取码，不绑定）。\n2. 主播控制台填写直播间和QQ群号，生成绑定码。\n3. 在此私聊发送 /绑定 绑定码。\n4. 私聊发送 /绑定群 群接入码 绑定码，再回控制台确认目标群。\n查看连接：私聊 /查看群。\n解绑：原绑定QQ私聊 /解绑群；多个群时按提示指定目标。\n观众：群内 /绑定B站 → 直播间短码 → 自动成功回复 → /排队；退出等待队列用 /取消排队。查询：/查看绑定、/解绑B站、/zzz帮助。红包：/红包排队 金额，由主播核对。\n升级保留完整data文件夹，已验证身份不用重绑。'});return;}
          if(content==='查看群'){const owned=[...relay.clients.values()].filter(c=>c.ownerOpenId===String(input.openid||'')&&(c.groupOpenId||c.pendingGroup));send(200,{reply:owned.length?'你的群连接：\n'+owned.map(c=>`${c.numericGroupId||c.groupOpenId||c.pendingGroup.openid}（${c.groupOpenId?'已绑定':'待控制台确认'}）`).join('\n'):'尚未绑定群。请发送 /帮助 查看接入步骤。'});return;}
          const privateGroup=/^绑定群\s+(G[A-F0-9]{10})\s+([A-Z2-9]{10})$/i.exec(content);
          if(privateGroup){await relay.requestGroupPrivate(String(input.openid||''),privateGroup[1].toUpperCase(),privateGroup[2].toUpperCase());send(200,{reply:'已收到私聊群绑定请求。请回主播控制台核对并确认目标群。'});return;}
          const unbind=/^解绑群(?:\s+([A-Za-z0-9_-]{5,128}))?$/.exec(content);
          if(unbind){send(200,{reply:await relay.unbindOwnerGroup(String(input.openid||''),unbind[1]||'')});return;}

          const code = /^绑定\s+([A-Z2-9]{10})$/i.exec(content)?.[1]?.toUpperCase();
          if (!code) { send(200, { reply: '私聊发送 /帮助 查看主播绑定、解绑和其他口令。' }); return; }
          await relay.bindOwner(String(input.openid || ''), code);
          send(200, { reply: '私聊身份已确认。请取得目标群接入码，然后在此私聊发送：/绑定群 群接入码 ' + code }); return;
        }
        if (url.pathname === '/bot/group') {
          const groupOpenId = String(input.groupOpenId || '');
          if(/^绑定群(?:\s|$)|^解绑群(?:\s|$)|^绑定(?:\s|$)/.test(content)){send(200,{reply:'主播群绑定和解绑只能私聊机器人操作，请私聊发送 /帮助。'});return;}
          if(content==='帮助'){const code=relay.issueGroupAccess(groupOpenId,input.groupId);send(200,{reply:`本群接入码：${code}（10分钟有效）。这条消息仅提供接入码，不会绑定或解绑群。主播请复制此码并私聊机器人 /帮助。观众使用 /绑定B站 验证后 /排队，游戏查询使用 /zzz帮助。`});return;}
          if (!content || content.length > 80) { send(200, { reply: null }); return; }
          await relay.rememberMember(groupOpenId, String(input.memberOpenId || ''), input.name);
          if (/^绑定B站(?:\s+[1-9]\d{0,19})?$/.test(content) || ['查看绑定','解绑B站'].includes(content)) {
            const result=await relay.queue(groupOpenId,String(input.memberOpenId || ''),input.name,String(input.messageId || ''),content);
            send(200,{reply:result.error||result.reply||'主播排队助手版本过旧，请更新后使用 UID 验证绑定。'}); return;
          }
          if (/^绑定B站(?:\s|$)/.test(content) || ['查看绑定', '解绑B站'].includes(content)) {
            send(200, { reply: '请发送：@机器人 /绑定B站（无需填写UID或昵称），再按提示到主播直播间验证。' }); return;
          }
          if (/^zzz/i.test(content)) { send(200, { reply: null }); return; }
          const result = await relay.queue(groupOpenId, String(input.memberOpenId || ''), input.name, String(input.messageId || ''), content);
          const reply = /^红包排队(?:\s|$)/.test(content)?result.error||result.reply||'主播排队助手尚未支持红包核对，请更新后使用。':result.ignored ? null : result.error || result.reply || (result.current ? '你正在当前位。' : result.queued ? `已在排队列表，第 ${result.position} 位。` : '未入队；请检查主播是否开放排队及免费排队。');
          send(200, { reply }); return;
        }
        send(404, { error: 'Not found' }); return;
      }
      const id = String(req.headers['x-queue-client-id'] || '');
      if (url.pathname === '/client/register') {
        const forwarded = String(req.headers['cf-connecting-ip'] || '');
        const address = isIP(forwarded) ? forwarded : req.socket.remoteAddress;
        const now = Date.now();
        if (registrations.size > 10_000) for (const [key, value] of registrations) if (value.until <= now) registrations.delete(key);
        const previous = registrations.get(address);
        const attempt = previous && previous.until > now ? previous : { count: 0, until: now + 60_000 };
        if (attempt.count >= 5) { send(429, { error: '绑定请求过多，请一分钟后重试' }); return; }
        attempt.count++;
        registrations.set(address, attempt);
        send(200, await relay.register({ id, token: bearer, code: input.code })); return;
      }
      if (url.pathname === '/client/identity-sync') {send(200,await relay.syncIdentities(id,bearer,input,sendCall));return;}
      if (url.pathname === '/client/status') { send(200, relay.status(id, bearer)); return; }
      if (url.pathname === '/client/confirm-group') { send(200, await relay.confirmGroup(id, bearer, String(input.groupOpenId || ''), input.numericGroupId)); return; }
      if (url.pathname === '/client/unbind') { send(200, await relay.unbind(id, bearer)); return; }
      if (url.pathname === '/client/announce') { send(200, await relay.announce(id, bearer, input, sendCall)); return; }
      if (url.pathname === '/client/game-qr') { send(200, await relay.sendGameQr(id,bearer,input,sendImage)); return; }
      if (url.pathname === '/client/poll') { send(200, { event: await relay.poll(id, bearer, AbortSignal.timeout(16_000)) }); return; }
      if (url.pathname === '/client/ack') { send(200, await relay.ack(id, bearer, String(input.id || ''), input.result || {})); return; }
      send(404, { error: 'Not found' });
    } catch (error) { send(error.status || 400, { error: error.message }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(listenPort, hostname, resolve); });
  return { relay, server, url: `http://${hostname}:${server.address().port}` };
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) {
  if (!botToken || botToken.length < 32) throw Error('Set PUBLIC_QQ_BOT_TOKEN to a random secret of at least 32 characters');
  const { url } = await createRelayServer();
  console.log(`Public QQ relay listening at ${url}`);
}
