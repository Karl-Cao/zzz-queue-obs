import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';

export function bridgeExecutable() {
  return process.env.LAPLACE_BRIDGE_EXE || fileURLToPath(new URL('../vendor/leb-server-windows-x64.exe', import.meta.url));
}

export function reachable(host, port) {
  return new Promise(resolve => {
    const socket = createConnection({ host, port });
    const done = result => { socket.destroy(); resolve(result); };
    socket.setTimeout(1200); socket.once('connect', () => done(true)); socket.once('error', () => done(false)); socket.once('timeout', () => done(false));
  });
}
export class Bridge {
  constructor(settings, onEvents, onStatus) {
    this.settings = settings; this.onEvents = onEvents; this.onStatus = onStatus;
    this.status = { state: 'disconnected', detail: '尚未连接', lastEventAt: null, received: 0 };
    this.generation = 0; this.lastLaunch = 0;
  }
  update(values) { Object.assign(this.status, values); this.onStatus(); }
  async connect() {
    const generation = ++this.generation;
    clearTimeout(this.retry); clearTimeout(this.timeout);
    const old = this.ws; this.ws = null; old?.close();
    const settings = this.settings();
    this.update({ state: 'connecting', detail: '正在连接事件桥接…' });
    try {
      const url = new URL(settings.bridgeUrl);
      const localDefault = ['localhost', '127.0.0.1'].includes(url.hostname) && ['9696', '9698'].includes(url.port);
      if (localDefault && !await reachable('127.0.0.1', Number(url.port))) {
        if (process.platform !== 'win32') throw Error('9696 端口没有桥接服务，请先启动 LAPLACE Event Bridge');
        const executable = bridgeExecutable();
        try { await access(executable); } catch { throw Error('缺少 vendor/leb-server-windows-x64.exe，请使用完整便携包，或设置 LAPLACE_BRIDGE_EXE'); }
        if (Date.now() - this.lastLaunch > 10000) {
          this.lastLaunch = Date.now();
          const args = ['-host', '127.0.0.1', '-port', url.port];
          if (settings.bridgeToken) args.push('-auth', settings.bridgeToken);
          const child = spawn(executable, args, { windowsHide: true, stdio: 'ignore' });
          this.child = child;
          child.on('error', e => { if (generation === this.generation) this.update({ detail: `启动桥接失败：${e.message}` }); }); child.unref();
          this.update({ detail: '正在自动启动本机 Event Bridge…' });
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (generation !== this.generation) return;
      const ws = new WebSocket(settings.bridgeUrl, settings.bridgeToken ? ['client', settings.bridgeToken] : ['client']); this.ws = ws;
      this.timeout = setTimeout(() => { if (this.ws === ws) { this.update({ state: 'disconnected', detail: '连接超时，请检查桥接地址与令牌' }); ws.close(); } }, 8000);
      ws.onopen = () => { if (this.ws !== ws) return; clearTimeout(this.timeout); this.update({ state: 'connected', detail: '桥接已连接，等待 LAPLACE Chat 推送事件' }); };
      ws.onmessage = async ({ data }) => {
        if (this.ws !== ws) return;
        if (data === 'ping') { ws.send('pong'); return; }
        try {
          const text = typeof data === 'string' ? data : await data.text();
          const parsed = JSON.parse(text), events = Array.isArray(parsed) ? parsed : [parsed];
          const content = events.filter(e => !['established', 'ping', 'pong', 'heartbeat'].includes(e?.type));
          if (!content.length) return;
          await this.onEvents(content);
          this.update({ lastEventAt: Date.now(), received: this.status.received + content.length, detail: '桥接已连接，正在接收事件' });
        } catch (e) { this.update({ detail: `事件处理失败：${e.message}` }); }
      };
      ws.onerror = () => { if (this.ws === ws) this.update({ state: 'disconnected', detail: '握手失败：请检查桥接是否运行，以及令牌是否一致' }); };
      ws.onclose = e => { if (this.ws !== ws) return; clearTimeout(this.timeout); this.update({ state: 'disconnected', detail: this.status.state === 'connected' ? `桥接断开（${e.code}），正在重连` : this.status.detail }); this.retry = setTimeout(() => this.connect(), 3000); };
    } catch (e) { if (generation !== this.generation) return; this.update({ state: 'disconnected', detail: e.message }); this.retry = setTimeout(() => this.connect(), 5000); }
  }
  close() { this.generation++; clearTimeout(this.retry); clearTimeout(this.timeout); const ws = this.ws; this.ws = null; ws?.close(); this.child?.kill(); }
}
