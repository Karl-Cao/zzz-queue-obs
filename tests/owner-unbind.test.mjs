import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PublicRelay} from '../public_bot/relay-core.mjs';
test('private owner unbinding is scoped, persistent and stops pending queue requests',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'zzz-owner-unbind-'));const r=new PublicRelay(dir);
 try{
  const token='a'.repeat(64);
  await r.register({id:'client-one',token,code:'ABCDEFGHJK'});
  await r.bindOwner('owner-one','ABCDEFGHJK');await r.requestGroup('group-one','group-openid','ABCDEFGHJK');
  await r.confirmGroup('client-one',token,'group-one','927643163');
  assert.equal(r.status('client-one',token).numericGroupId,'927643163');
  await assert.rejects(r.unbindOwnerGroup('owner-other','927643163'),/没有找到/);
  r.clients.get('client-one').lastPollAt=Date.now();
  const pending=r.queue('group-one','member-one','Viewer','message-one');
  assert.match(await r.unbindOwnerGroup('owner-one'),/已解除/);
  assert.match((await pending).error,/绑定已解除/);
  assert.equal(r.status('client-one',token).ownerBound,false);
  const loaded=await new PublicRelay(dir).load();assert.equal(loaded.status('client-one',token).groupOpenId,'');
  await assert.rejects(loaded.unbindOwnerGroup('owner-one'),/没有找到/);
 }finally{r.shutdown();await rm(dir,{recursive:true,force:true});}
});
test('owner with multiple bound groups must choose explicitly',async()=>{
 const r=new PublicRelay('unused');
 r.clients.set('client-one',{id:'client-one',ownerOpenId:'owner-one',groupOpenId:'group-one'});
 r.clients.set('client-two',{id:'client-two',ownerOpenId:'owner-one',groupOpenId:'group-two'});
 await assert.rejects(r.unbindOwnerGroup('owner-one'),/多个群/);
 assert.equal(r.clients.get('client-one').groupOpenId,'group-one');
});
