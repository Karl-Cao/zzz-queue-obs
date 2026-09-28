import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicRelay } from '../public_bot/relay-core.mjs';
test('nickname binding is removed, including empty and nickname commands', async () => {
 const relay = new PublicRelay('unused');
 for (const command of ['绑定B站','绑定B站 小明','查看绑定'])
  await assert.rejects(relay.viewerBinding('group-A','member-A',command), /昵称绑定已取消.*\/绑定B站/);
});


test('loading old records clears nickname-only bindings but preserves verified UID and group routing',async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'zzz-legacy-nick-'));
 try{
  await writeFile(join(dir,'bindings.json'),JSON.stringify({version:1,clients:[{id:'client-one',groupOpenId:'group-one',ownerOpenId:'owner-one',members:[{openid:'old-user',name:'QQ name',bilibiliName:'Self-entered'},{openid:'verified-user',name:'QQ name',bilibiliUid:'123',bilibiliName:'Verified'}]}]}));
  const r=await new PublicRelay(dir).load();const c=r.clients.get('client-one');
  assert.equal(c.members[0].bilibiliName,undefined);assert.equal(c.members[0].name,'QQ name');
  assert.equal(c.members[1].bilibiliUid,'123');assert.equal(c.members[1].bilibiliName,'Verified');
  assert.equal(c.groupOpenId,'group-one');assert.equal(c.ownerOpenId,'owner-one');
  const persisted=JSON.parse(await readFile(join(dir,'bindings.json'),'utf8'));assert.equal(persisted.clients[0].members[0].bilibiliName,undefined);
 }finally{await rm(dir,{recursive:true,force:true});}
});
