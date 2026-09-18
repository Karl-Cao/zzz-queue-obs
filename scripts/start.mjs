import { readFile, mkdir, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { findFreePort } from './ports.mjs';
import { launcherLock } from './launcher-lock.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const instance=createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,16);
const stop=process.argv.includes('--stop'), restart=process.argv.includes('--restart');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const health=async port=>{try{const r=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1000)});const x=await r.json();return x.app==='obs-viewer-queue'&&x.instance===instance;}catch{return false;}};
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
const launchBrowser=port=>{if(process.env.QUEUE_NO_BROWSER==='1')return;const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Start-Process 'http://127.0.0.1:${port}'`],{windowsHide:true,stdio:'ignore'});child.on('error',()=>{});child.unref();};
async function stopOwned(runtime){
  if(!runtime?.pid||!alive(runtime.pid))return;
  if(process.platform!=='win32')throw Error('Old process is still running');
  await new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',root+'scripts/stop-owned.ps1','-ProcessId',String(runtime.pid),'-NodePath',process.execPath,'-EntryPath',root+'server/index.mjs'],{windowsHide:true,stdio:'ignore'});
    child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Unable to stop old service / 无法停止旧服务')));
  });
}
const unlock=await launcherLock(instance);
try{
  let runtime;try{runtime=JSON.parse(await readFile(root+'data/runtime.json','utf8'));}catch{}
  const recorded=runtime?.instance===instance?runtime:null;
  let preferred=recorded?.port||Number(process.env.PORT||3667);
  const online=await health(preferred);
  if(stop||restart){
    if(online){
      const base=`http://127.0.0.1:${preferred}`;
      try{const response=await fetch(base+'/api/shutdown',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(3000)});if(!response.ok)throw Error('Shutdown rejected');}catch(e){console.error(e.message);}
      const until=Date.now()+10000;
      while(recorded?.pid&&alive(recorded.pid)&&Date.now()<until)await delay(150);
    }
    await stopOwned(recorded);
    if(await health(preferred))throw Error('Old service did not stop / 旧服务尚未停止');
    console.log('Queue service stopped.');
  }else if(online){launchBrowser(preferred);console.log(`Already running: http://127.0.0.1:${preferred}`);}
  if(!stop&&(restart||!online)){
    if(!restart)await stopOwned(recorded);
    const port=await findFreePort(preferred);await mkdir(root+'data',{recursive:true});
    const log=await open(root+'data/server.log','a'),error=await open(root+'data/server-error.log','a');
    const child=spawn(process.execPath,[root+'server/index.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,detached:true,stdio:['ignore',log.fd,error.fd]});
    let failure;child.on('error',e=>failure=e);child.unref();
    try{
      const until=Date.now()+90000;let ready=false;
      while(Date.now()<until){if(failure)throw failure;if(child.exitCode!==null)throw Error('Server exited during startup');if(await health(port)){ready=true;break;}await delay(250);}
      if(!ready)throw Error('Startup timed out. See data/server-error.log.');
      launchBrowser(port);console.log(`Started: http://127.0.0.1:${port}`);
    }catch(e){child.kill();throw e;}finally{await log.close();await error.close();}
  }
}finally{await unlock();}
