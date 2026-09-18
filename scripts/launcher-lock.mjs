import { createServer } from 'node:net';
export async function launcherLock(instance) {
  if(process.platform !== 'win32') return async()=>{};
  const address = `\\\\.\\pipe\\zzz-queue-launch-${instance}`;
  const deadline=Date.now()+120000;
  while(true){
    const server=createServer(socket=>socket.end());
    const error=await new Promise(resolve=>{server.once('error',resolve);server.listen(address,()=>resolve(null));});
    if(!error)return ()=>new Promise(resolve=>server.close(resolve));
    if(error.code!=='EADDRINUSE'||Date.now()>deadline)throw Error('Another launcher is busy / 另一个启动操作仍在进行');
    await new Promise(resolve=>setTimeout(resolve,150));
  }
}
