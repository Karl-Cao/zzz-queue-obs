import { execFile } from 'node:child_process';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const exists = async path => access(path).then(() => true, () => false);

async function probe(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1200) });
    return response.status < 500;
  } catch { return false; }
}

export async function qqStatus(root) {
  const bundled = await exists(`${root}qq/runtime/python/python.exe`);
  const installed = bundled || await exists(`${root}data/qq-runtime/core-venv/Scripts/core.exe`);
  const core = await probe(8765);
  let nonebot = false, bots = [], mode = null;
  try {
    const response = await fetch('http://127.0.0.1:18080/zzz-queue/status', { signal: AbortSignal.timeout(1500) });
    if (response.ok) { const info = await response.json(); if (info.app === 'zzz-queue-qq') { nonebot = true; bots = info.bots || []; mode = info.mode || null; } }
    if (!nonebot) nonebot = await probe(18080);
  } catch { nonebot = await probe(18080); }
  const officialConfigured = await exists(`${root}data/qq-runtime/official-bot.json`);
  let observedGroups = [];
  try { observedGroups = JSON.parse(await readFile(`${root}data/qq-runtime/official-groups.json`, 'utf8')).slice(0, 10); } catch { /* no group events yet */ }
  return { installed, bundled, officialConfigured, core, nonebot, mode, botConnected: bots.length > 0, botCount: bots.length, observedGroups };
}

export async function saveOfficialCredentials(root, input) {
  const appId = String(input?.appId || '').trim();
  const secret = String(input?.secret || '').trim();
  if (!/^\d{5,32}$/.test(appId) || secret.length < 16 || secret.length > 512 || /['\r\n]/.test(secret)) {
    throw Error('请输入有效的 QQ 机器人 AppID 与 AppSecret');
  }
  const folder = `${root}data/qq-runtime`;
  await mkdir(folder, { recursive: true });
  const path = `${folder}/official-bot.json`;
  await writeFile(`${path}.tmp`, JSON.stringify({ appId, secret }), { mode: 0o600 });
  await rename(`${path}.tmp`, path);
  return { ok: true, appId };
}

export async function startQQ(root) {
  if (!await exists(`${root}qq/start-local-stack.ps1`)) throw Error('QQ 启动脚本不存在');
  const { stderr } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', `${root}qq/start-local-stack.ps1`, '-SkipTray',
  ], { cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 256 * 1024 });
  if (stderr.trim()) throw Error(stderr.trim().slice(-500));
  return qqStatus(root);
}

export async function restartQQ(root) {
  const { stderr } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', `${root}qq/restart-local-bot.ps1`,
  ], { cwd: root, windowsHide: true, timeout: 180000, maxBuffer: 256 * 1024 });
  if (stderr.trim()) throw Error(stderr.trim().slice(-500));
  return qqStatus(root);
}

export async function stopQQ(root) {
  const { stderr } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', `${root}qq/stop-local-stack.ps1`,
  ], { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 256 * 1024 });
  if (stderr.trim()) throw Error(stderr.trim().slice(-500));
}

export async function connectNapCat(root) {
  const { stdout, stderr } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', `${root}qq/connect-napcat.ps1`,
  ], { cwd: root, windowsHide: true, timeout: 15000, maxBuffer: 256 * 1024 });
  if (stderr.trim()) throw Error(stderr.trim().slice(-500));
  return { message: stdout.trim() };
}

export async function syncQQConfig(directory, settings, port) {
  const folder = `${directory}/qq-runtime/gsuid_queue`;
  await mkdir(folder, { recursive: true });
  const path = `${folder}/settings.json`;
  const payload = {
    group_id: settings.qqGroupId,
    group_openid: settings.qqGroupOpenId || '',
    token: settings.qqToken,
    queue_url: `http://127.0.0.1:${port}/api/qq/message`,
  };
  await writeFile(`${path}.tmp`, JSON.stringify(payload), { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}
