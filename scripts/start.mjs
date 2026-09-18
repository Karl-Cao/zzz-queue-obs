import { readFile, mkdir, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { findFreePort } from './ports.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const instance = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,16);
const stop = process.argv.includes('--stop');
let preferred = Number(process.env.PORT || 3667);
try { const runtime = JSON.parse(await readFile(root + 'data/runtime.json', 'utf8')); if (!process.env.PORT) preferred = runtime.port; } catch {}
const health = async port => { try { const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) }); const x = await r.json(); return x.app === 'obs-viewer-queue' && x.instance === instance; } catch { return false; } };
const launchBrowser = port => { if (process.env.QUEUE_NO_BROWSER === '1') return; const url = `http://127.0.0.1:${port}`; const child = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-Command',`Start-Process '${url}'`], { windowsHide: true, stdio:'ignore' }); child.on('error', () => console.log(url)); child.unref(); };
if (await health(preferred)) {
  if (stop) { const base = `http://127.0.0.1:${preferred}`; await fetch(base + '/api/shutdown', { method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}' }); console.log('Queue service stopped.'); }
  else { launchBrowser(preferred); console.log(`Already running: http://127.0.0.1:${preferred}`); }
} else if (stop) console.log('This copy is not running.');
else {
  const port = await findFreePort(preferred); await mkdir(root + 'data', { recursive: true });
  const log = await open(root + 'data/server.log','a'), error = await open(root + 'data/server-error.log','a');
  const child = spawn(process.execPath, [root + 'server/index.mjs'], { cwd:root, env:{...process.env,PORT:String(port)},windowsHide:true,detached:true,stdio:['ignore',log.fd,error.fd] });
  let failure; child.on('error', e => failure=e); child.unref();
  let online = false;
  for(let i=0;i<40;i++){if(failure)throw failure;if(await health(port)){online=true;break;}await new Promise(resolve=>setTimeout(resolve,250));}
  await log.close(); await error.close();
  if(!online)throw Error('Startup failed. See data/server-error.log.');
  launchBrowser(port);console.log(`Started: http://127.0.0.1:${port}`);
}
