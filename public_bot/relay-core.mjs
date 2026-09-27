import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const hash = value => createHash('sha256').update(value).digest('hex');
const codePattern = /^[A-Z2-9]{10}$/;
const idPattern = /^[A-Za-z0-9_-]{5,128}$/;
const tokenPattern = /^[a-f0-9]{64}$/;
const same = (a, b) => {
  const left = Buffer.from(a || ''), right = Buffer.from(b || '');
  return left.length === right.length && timingSafeEqual(left, right);
};
const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };

export class PublicRelay {
  constructor(directory, { now = () => Date.now(), deliveryTimeoutMs = 8000 } = {}) {
    this.directory = directory;
    this.now = now;
    this.deliveryTimeoutMs = deliveryTimeoutMs;
    this.clients = new Map();
    this.pending = new Map();
    this.waiters = new Map();
    this.attempts = new Map();
    this.sentCalls = new Map();
    this.writes = Promise.resolve();
  }

  async load() {
    try {
      const saved = JSON.parse(await readFile(join(this.directory, 'bindings.json'), 'utf8'));
      for (const client of saved.clients || []) this.clients.set(client.id, client);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return this;
  }

  async save() {
    const clients = [...this.clients.values()].map(({ lastPollAt, ...client }) => client);
    const data = JSON.stringify({ version: 1, clients });
    this.writes = this.writes.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const target = join(this.directory, 'bindings.json');
      await writeFile(`${target}.tmp`, data, { mode: 0o600 });
      await rename(`${target}.tmp`, target);
    });
    return this.writes;
  }

  authenticated(id, token) {
    const client = this.clients.get(id);
    if (!client || !tokenPattern.test(token || '') || !same(client.tokenHash, hash(token))) fail('客户端认证失败', 401);
    return client;
  }

  async register({ id, token, code }) {
    if (!idPattern.test(id || '') || !tokenPattern.test(token || '')) fail('客户端标识无效');
    const existing = this.clients.get(id);
    if (existing) this.authenticated(id, token);
    if (!existing && !codePattern.test(code || '')) fail('绑定码无效');
    if (code !== undefined && !codePattern.test(code)) fail('绑定码无效');
    if (!existing && this.clients.size >= 1000) fail('公共机器人已达到客户端上限', 503);
    const client = existing || { id, tokenHash: hash(token), ownerOpenId: '', groupOpenId: '', numericGroupId: '' };
    if (code) {
      client.codeHash = hash(code);
      client.codeExpiresAt = this.now() + 5 * 60_000;
      client.pendingGroup = null;
      client.ownerOpenId = '';
      client.groupOpenId = '';
      client.numericGroupId = '';
      client.members = [];
    }
    this.clients.set(id, client);
    await this.save();
    return this.status(id, token);
  }

  status(id, token) {
    const client = this.authenticated(id, token);
    return {
      ownerBound: Boolean(client.ownerOpenId),
      groupOpenId: client.groupOpenId || '',
      numericGroupId: client.numericGroupId || '',
      pendingGroup: client.pendingGroup || null,
      online: Boolean(client.lastPollAt && this.now() - client.lastPollAt < 30_000),
      codeExpiresAt: client.codeExpiresAt || null,
    };
  }

  checkAttempts(openid) {
    const now = this.now();
    const attempt = this.attempts.get(openid);
    if (attempt && attempt.until > now && attempt.count >= 5) fail('尝试过多，请稍后再试', 429);
    this.attempts.set(openid, attempt && attempt.until > now ? { ...attempt, count: attempt.count + 1 } : { count: 1, until: now + 60_000 });
  }

  async bindOwner(openid, code) {
    if (!idPattern.test(openid || '') || !codePattern.test(code || '')) fail('绑定信息无效');
    this.checkAttempts(openid);
    const codeHash = hash(code);
    const client = [...this.clients.values()].find(item => item.codeExpiresAt > this.now() && same(item.codeHash, codeHash));
    if (!client) fail('绑定码无效或已过期', 404);
    if (client.ownerOpenId && client.ownerOpenId !== openid) fail('此绑定码已由另一账号确认', 409);
    client.ownerOpenId = openid;
    await this.save();
    return { ok: true, clientId: client.id };
  }

  async requestGroup(groupOpenId, numericGroupId, code) {
    if (!idPattern.test(groupOpenId || '') || !codePattern.test(code || '')) fail('群绑定信息无效');
    const client = [...this.clients.values()].find(item => item.codeExpiresAt > this.now() && item.ownerOpenId && same(item.codeHash, hash(code)));
    if (!client) fail('请先私聊机器人绑定有效码', 404);
    if ([...this.clients.values()].some(item => item.id !== client.id && item.groupOpenId === groupOpenId)) fail('此群已绑定另一位主播', 409);
    client.pendingGroup = { openid: groupOpenId, numericId: String(numericGroupId || ''), requestedAt: this.now() };
    await this.save();
    return { ok: true };
  }

  async confirmGroup(id, token, groupOpenId) {
    const client = this.authenticated(id, token);
    if (!client.pendingGroup || client.pendingGroup.openid !== groupOpenId || this.now() - client.pendingGroup.requestedAt > 5 * 60_000) fail('没有待确认的群绑定', 409);
    if ([...this.clients.values()].some(item => item.id !== id && item.groupOpenId === groupOpenId)) fail('此群已绑定另一位主播', 409);
    client.groupOpenId = groupOpenId;
    client.numericGroupId = client.pendingGroup.numericId;
    client.pendingGroup = null;
    client.codeHash = '';
    client.codeExpiresAt = 0;
    await this.save();
    return this.status(id, token);
  }

  async unbind(id, token) {
    const client = this.authenticated(id, token);
    client.ownerOpenId = '';
    client.groupOpenId = '';
    client.numericGroupId = '';
    client.pendingGroup = null;
    client.codeHash = '';
    client.codeExpiresAt = 0;
    client.members = [];
    await this.save();
    return { ok: true };
  }

  async rememberMember(groupOpenId, memberOpenId, name) {
    const client = [...this.clients.values()].find(item => item.groupOpenId === groupOpenId);
    const cleanName = String(name || '').trim().slice(0, 80);
    if (!client || !idPattern.test(memberOpenId || '') || !cleanName) return;
    client.members ||= [];
    const previous = client.members.find(item => item.openid === memberOpenId);
    if (previous?.name === cleanName) return;
    client.members = [{ ...previous, openid: memberOpenId, name: cleanName }, ...client.members.filter(item => item.openid !== memberOpenId)].sort((a,b) => Number(Boolean(b.bilibiliName))-Number(Boolean(a.bilibiliName))).slice(0, 500);
    await this.save();
  }

  async viewerBinding() { fail('昵称绑定已取消。请发送：@机器人 /绑定B站 你的B站UID'); }

  async announce(id, token, { announcementId, uid, name, text }, sendCall) {
    const client = this.authenticated(id, token);
    if (!client.groupOpenId) fail('请先绑定 QQ 群', 409);
    if (!/^[a-zA-Z0-9-]{8,128}$/.test(announcementId || '')) fail('叫号标识无效');
    const cleanName = String(name || '').trim().slice(0, 80);
    if (!cleanName) fail('叫号昵称无效');
    if(text!==undefined&&(typeof text!=='string'||!text.trim()||text.length>500))fail('叫号词无效');
    const key = `${id}:${announcementId}`;
    if (this.sentCalls.has(key)) return this.sentCalls.get(key);
    const members = client.members || [];
    const direct = /^qq:([A-Za-z0-9_-]{5,128})$/.exec(String(uid || ''))?.[1];
    const directMember = direct && members.find(member => member.openid === direct);
    const normalized = cleanName.normalize('NFKC').toLocaleLowerCase();
    const boundMatches = members.filter(member => (member.bilibiliUid ? member.bilibiliName : undefined)?.normalize('NFKC').toLocaleLowerCase() === normalized);
    const matches = boundMatches.length ? boundMatches : members.filter(member => !member.bilibiliUid && member.name.normalize('NFKC').toLocaleLowerCase() === normalized);
    const memberOpenId = directMember?.openid || (matches.length === 1 ? matches[0].openid : '');
    const verifiedMember=members.find(member=>member.bilibiliUid===String(uid||''));
    const resolvedMember=verifiedMember?.openid||memberOpenId;
    const result = { groupOpenId: client.groupOpenId, memberOpenId:resolvedMember, name: cleanName, mentioned: Boolean(resolvedMember),...(text?{text}:{}) };
    await sendCall(result);
    this.sentCalls.set(key, result);
    if (this.sentCalls.size > 1000) this.sentCalls.delete(this.sentCalls.keys().next().value);
    return result;
  }

  async poll(id, token, signal) {
    const client = this.authenticated(id, token);
    client.lastPollAt = this.now();
    const next = () => [...this.pending.values()].find(item => item.clientId === id && !item.deliveredAt);
    if (next()) { const item = next(); item.deliveredAt = this.now(); return item.event; }
    return new Promise(resolve => {
      const done = value => { clearTimeout(timer); signal?.removeEventListener('abort', abort); if (this.waiters.get(id) === done) this.waiters.delete(id); resolve(value); };
      const abort = () => done(null);
      const timer = setTimeout(() => done(null), 15_000);
      signal?.addEventListener('abort', abort, { once: true });
      this.waiters.get(id)?.(null);
      this.waiters.set(id, done);
    });
  }

  async ack(id, token, eventId, result) {
    this.authenticated(id, token);
    const pending = this.pending.get(eventId);
    if (!pending || pending.clientId !== id) fail('事件已过期', 410);
    const client=this.clients.get(id), member=client.members?.find(m=>m.openid===pending.event.memberOpenId);
    if(member&&result.clearIdentity) { delete member.bilibiliUid; delete member.bilibiliName; await this.save(); }
    if(member&&result.verifiedIdentity) {
      const {uid,name}=result.verifiedIdentity;
      if(!/^[1-9]\d{0,19}$/.test(uid||'')||typeof name!=='string'||!name.trim()||name.length>80)fail('验证身份无效');
      if(client.members.some(m=>m!==member&&m.bilibiliUid===uid))fail('这个 UID 已绑定其他 QQ 成员');
      member.bilibiliUid=uid;member.bilibiliName=name;await this.save();
    }
    clearTimeout(pending.timer);
    this.pending.delete(eventId);
    pending.resolve(result);
    return { ok: true };
  }

  async queue(groupOpenId, memberOpenId, name, messageId, message = '排队') {
    const client = [...this.clients.values()].find(item => item.groupOpenId === groupOpenId);
    if (!client) return message === '排队'||/^红包排队(?:\s|$)/.test(message) ? { error: '此群尚未绑定主播排队助手' } : { ignored: true };
    if (!client.lastPollAt || this.now() - client.lastPollAt >= 30_000) return { error: '主播排队助手暂未连接' };
    if (!idPattern.test(memberOpenId || '') || !messageId || String(messageId).length > 512) return { error: 'QQ 消息标识无效' };
    const id = hash(`${groupOpenId}:${messageId}`);
    if (this.pending.has(id)) return { error: '消息正在处理，请稍后查看名单' };
    const boundMember = client.members?.find(item => item.openid === memberOpenId);
    const boundName = boundMember?.bilibiliUid ? boundMember.bilibiliName : undefined;
    const event = { id, groupOpenId, memberOpenId,qqName:String(name||'').slice(0,80), name: boundName || String(name || '').slice(0, 80) || `QQ用户${memberOpenId.slice(0, 6)}`, message: String(message || '').slice(0, 80), expiresAt: this.now() + this.deliveryTimeoutMs };
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve({ error: '主播排队助手暂未响应' }); }, this.deliveryTimeoutMs);
      const pending = { clientId: client.id, event, resolve, timer, deliveredAt: 0 };
      this.pending.set(id, pending);
      const waiter = this.waiters.get(client.id);
      if (waiter) { pending.deliveredAt = this.now(); waiter(event); }
    });
  }

  shutdown() {
    for (const wake of this.waiters.values()) wake(null);
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.resolve({ error: '公共机器人服务正在重启' }); }
    this.pending.clear();
  }
}

export function newClientIdentity() {
  return { id: randomBytes(16).toString('hex'), token: randomBytes(32).toString('hex') };
}

export function newPairCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...randomBytes(10)].map(byte => alphabet[byte % alphabet.length]).join('');
}
