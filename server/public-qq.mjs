import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const pairCode = () => [...randomBytes(10)].map(byte => alphabet[byte % alphabet.length]).join('');
const identity = () => ({ id: randomBytes(16).toString('hex'), token: randomBytes(32).toString('hex') });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function validateRelayUrl(value) {
  const url = new URL(value);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw Error('公共机器人地址必须是 HTTPS 根地址；仅本机测试可使用 HTTP');
  }
  return url.origin;
}

export class PublicQQClient {
  constructor(directory, getSettings, handleEvent) {
    this.path = join(directory, 'public-qq.json');
    this.getSettings = getSettings;
    this.handleEvent = handleEvent;
    this.config = null;
    this.running = false;
    this.lastContactAt = 0;
    this.lastError = '';
    this.lastAnnouncementError = '';
    this.lastIdentityError='';this.identitySignature='';this.lastIdentitySync=0;
  }

  async load() {
    try { this.config = JSON.parse(await readFile(this.path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (this.config && this.getSettings().qqMode === 'public') this.start();
  }

  async request(path, body = {}, timeout = 20_000, signal) {
    if (!this.config) throw Error('尚未连接公共机器人');
    const response = await fetch(`${this.config.url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.config.token}`, 'X-Queue-Client-Id': this.config.id },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([AbortSignal.timeout(timeout), signal]) : AbortSignal.timeout(timeout),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || `Relay HTTP ${response.status}`);
    this.lastContactAt = Date.now();
    this.lastError = '';
    return data;
  }

  async pair(url) {
    const base = validateRelayUrl(url);
    if (this.config && this.config.url !== base) throw Error('请先解除现有公共机器人连接');
    if (!this.config) this.config = { url: base, ...identity() };
    const code = pairCode();
    try {
      const status = await this.request('/client/register', { code }, 8000);
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(`${this.path}.tmp`, JSON.stringify(this.config), { mode: 0o600 });
      await rename(`${this.path}.tmp`, this.path);
      this.start();
      return { code, expiresAt: status.codeExpiresAt, url: base };
    } catch (error) { this.lastError = error.message; throw error; }
  }

  start() {
    if (this.running || !this.config) return;
    this.running = true;
    void this.loop();
  }

  stop() {
    this.running = false;
    this.pollController?.abort();
  }

  async loop() {
    while (this.running && this.config) {
      if (this.getSettings().qqMode !== 'public') { await delay(1000); continue; }
      try {
        this.pollController = new AbortController();
        const { event } = await this.request('/client/poll', {}, 20_000, this.pollController.signal);
        if (!event) continue;
        let result;
        try {
          if (Date.now() > event.expiresAt) throw Error('消息已过期');
          result = await this.handleEvent(event);
        } catch (error) { result = { error: error.message }; }
        try { await this.request('/client/ack', { id: event.id, result }, 8000); }
        catch (error) { this.lastError = error.message; }
      } catch (error) {
        if (!this.running) break;
        this.lastError = error.message;
        await delay(3000);
      }
    }
  }

  async status() {
    const local = { configured: Boolean(this.config), url: this.config?.url || '', connected: Boolean(this.lastContactAt && Date.now() - this.lastContactAt < 30_000), lastError: this.lastError, lastIdentityError:this.lastIdentityError,lastAnnouncementError: this.lastAnnouncementError };
    if (!this.config) return local;
    try { return { ...local, ...(await this.request('/client/status', {}, 8000)), connected: true, lastError: '' }; }
    catch (error) { return { ...local, connected: false, lastError: error.message }; }
  }

  async syncIdentities(groupOpenId,bindings,notices){
    const signature=JSON.stringify([groupOpenId,bindings]);
    if(!notices.length&&signature===this.identitySignature&&Date.now()-this.lastIdentitySync<30000)return {};
    const result=await this.request('/client/identity-sync',{groupOpenId,bindings,notices:notices.slice(0,3)},30000);
    this.identitySignature=signature;this.lastIdentitySync=Date.now();this.lastIdentityError=result.errors?.join('；')||'';return result;
  }
  async confirmGroup(openid) {const result=await this.request('/client/confirm-group',{groupOpenId:openid,numericGroupId:this.getSettings().qqGroupId},8000);this.identitySignature='';return result;}

  async announce(announcement, current) {
    if (!this.config || this.getSettings().qqMode !== 'public' || !announcement || !current) return null;
    try { const result = await this.request('/client/announce', { announcementId: announcement.id, uid: current.uid, name: current.username, text:announcement.qqText }, 8000); this.lastAnnouncementError = ''; return result; }
    catch (error) { this.lastAnnouncementError = error.message; throw error; }
  }

  async sendGameQr(announcement,current,qr,deliveryId,notify=false){
    if(!this.config||this.getSettings().qqMode!=='public')throw Error('请先连接公共 QQ 机器人');
    try{
      const result=await this.request('/client/game-qr',{announcementId:announcement.id,uid:current.uid,image:qr.image,deliveryId,notify},30000);
      this.lastAnnouncementError='';return result;
    }catch(error){this.lastAnnouncementError=error.message;throw error;}
  }

  async disconnect() {
    if (!this.config) return;
    await this.request('/client/unbind', {}, 8000);
    this.stop();
    this.config = null;
    this.lastContactAt = 0;
    await unlink(this.path).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
