import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export class SystemSpeech {
  constructor(changed) { this.changed = changed; this.lastId = null; this.status = { available: process.platform === 'win32', enabled: false, ready: false, detail: '电脑后台 TTS 未启用' }; }
  update(values) { Object.assign(this.status, values); this.changed(); }
  configure(enabled) {
    if (!enabled) { if (!this.child && !this.status.enabled) return; if (this.child) { const child = this.child; this.child = null; child.kill(); } this.update({ enabled: false, ready: false, detail: '电脑后台 TTS 未启用' }); return; }
    if (this.child) return;
    if (!this.status.available) { this.update({ detail: '电脑后台 TTS 仅支持 Windows，请使用浏览器 TTS' }); return; }
    this.update({ enabled: true, ready: false, detail: '正在加载 Windows 语音…' });
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./speech.ps1', import.meta.url))], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child; let buffer = '';
    child.stdout.setEncoding('utf8'); child.stdout.on('data', data => { buffer += data; const lines = buffer.split('\n'); buffer = lines.pop(); for (const line of lines) { try { const message = JSON.parse(line); if (this.child !== child) return; if (message.type === 'ready') { this.update({ ready: true, detail: message.chinese ? `后台语音就绪：${message.voice}` : `未安装中文语音，当前使用 ${message.voice}` }); } else if (message.type === 'completed') this.update({ lastCompletedAt: Date.now(), lastPlayback: 'completed' }); else if (message.type === 'cancelled') this.update({ lastPlayback: 'cancelled' }); else this.update({ lastPlayback: 'error', detail: `语音错误：${message.message || '播放失败'}` }); } catch {} } });
    child.stdin.on('error', () => {}); child.stderr.on('data', data => { if (this.child === child) this.update({ detail: `语音错误：${String(data).slice(0,200)}` }); });
    child.on('error', e => { if (this.child === child) { this.child = null; this.update({ ready: false, detail: `语音启动失败：${e.message}` }); } });
    child.on('exit', () => { if (this.child === child) { this.child = null; this.update({ ready: false, detail: this.status.detail.startsWith('语音错误') ? this.status.detail : '后台语音已停止，请重新启用' }); } });
  }
  announce(announcement) { if (!announcement || announcement.id === this.lastId) return; this.lastId = announcement.id; if (this.child && this.status.enabled) this.child.stdin.write(JSON.stringify({ text: announcement.text.slice(0,300), language: announcement.language || (/[\u3400-\u9fff]/.test(announcement.text.slice(0,2)) ? 'zh-CN' : 'en-US') }) + '\n'); }
  close() { const child = this.child; this.child = null; child?.kill(); }
}
