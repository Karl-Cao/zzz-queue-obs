import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
export async function loadIdentityStore(directory,state) {
 try {
  const data=JSON.parse(await readFile(join(directory,'qq-identities.json'),'utf8'));
  if(data.version!==1||!data.bindings||typeof data.bindings!=='object'||Array.isArray(data.bindings)||!Array.isArray(data.outbox))throw Error('Invalid saved QQ identities');
  state.qqIdentities=data.bindings;state.qqIdentityOutbox=data.outbox;
 }catch(error){if(error.code!=='ENOENT')throw error;}
 state.qqIdentities ||= {};state.qqIdentityOutbox ||= [];
}
export async function saveIdentityStore(directory,state) {
 await mkdir(directory,{recursive:true});const target=join(directory,'qq-identities.json');
 await writeFile(target+'.tmp',JSON.stringify({version:1,bindings:state.qqIdentities||{},outbox:state.qqIdentityOutbox||[]}),{mode:0o600});await rename(target+'.tmp',target);
}
