import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {loadIdentityStore,saveIdentityStore} from '../server/qq-identity-store.mjs';
import {PublicRelay} from '../public_bot/relay-core.mjs';
test('identity data survives upgrade without queue state and persists unbinding',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'zzz-identity-data-'));
 try{
  const old={qqIdentities:{'group-one:member-one':{uid:'123',name:'Viewer'}},qqIdentityOutbox:[]};
  await loadIdentityStore(dir,old);await saveIdentityStore(dir,old);
  const upgraded={};await loadIdentityStore(dir,upgraded);assert.equal(upgraded.qqIdentities['group-one:member-one'].uid,'123');
  delete upgraded.qqIdentities['group-one:member-one'];await saveIdentityStore(dir,upgraded);
  const stale={qqIdentities:old.qqIdentities};await loadIdentityStore(dir,stale);assert.deepEqual(stale.qqIdentities,{});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('private group binding checks owner and expiry, sync restores identities and deduplicates success notices',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'zzz-identity-relay-'));let now=1000000;
 const r=new PublicRelay(dir,{now:()=>now});const token='a'.repeat(64),id='client-one',owner='owner-one';
 try{
  await r.register({id,token,code:'ABCDEFGHJK'});await r.bindOwner(owner,'ABCDEFGHJK');
  const access=r.issueGroupAccess('group-one','927643163');
  await assert.rejects(r.requestGroupPrivate('other-owner',access,'ABCDEFGHJK'),/自己的QQ/);
  await r.requestGroupPrivate(owner,access,'ABCDEFGHJK');await r.confirmGroup(id,token,'group-one');
  const b={memberOpenId:'member-one',uid:'123',name:'Viewer'},n={...b,id:randomUUID(),groupOpenId:'group-one'};const input={groupOpenId:'group-one',bindings:[b],notices:[n]};const sent=[];
  await assert.rejects(r.syncIdentities(id,token,{...input,groupOpenId:'wrong-group'},async()=>{}),/不匹配/);
  const result=await r.syncIdentities(id,token,input,async p=>sent.push(p));assert.deepEqual(result.delivered,[n.id]);assert.equal(sent.length,1);
  const loaded=await new PublicRelay(dir,{now:()=>now}).load();await loaded.syncIdentities(id,token,input,async p=>sent.push(p));assert.equal(sent.length,1);
  await loaded.register({id,token,code:'ABCDEFGHJL'});await loaded.bindOwner(owner,'ABCDEFGHJL');
  const next=loaded.issueGroupAccess('group-one','927643163');await loaded.requestGroupPrivate(owner,next,'ABCDEFGHJL');await loaded.confirmGroup(id,token,'group-one');
  await loaded.syncIdentities(id,token,{...input,notices:[]},async()=>{});
  assert.equal(loaded.clients.get(id).members[0].bilibiliUid,'123');
  await loaded.syncIdentities(id,token,{groupOpenId:'group-one',bindings:[],notices:[]},async()=>{});assert.equal(loaded.clients.get(id).members[0].bilibiliUid,undefined);
  const expired=loaded.issueGroupAccess('group-two','123456');now+=600001;
  await loaded.register({id,token,code:'ABCDEFGHJM'});await loaded.bindOwner(owner,'ABCDEFGHJM');
  await assert.rejects(loaded.requestGroupPrivate(owner,expired,'ABCDEFGHJM'),/过期/);
 }finally{r.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('failed success notification keeps verified cache and retries after cooldown',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'zzz-identity-retry-'));let now=1000000;
 const r=new PublicRelay(dir,{now:()=>now});const token='b'.repeat(64),id='retry-client';
 try{
  await r.register({id,token,code:'ABCDEFGHJK'});await r.bindOwner('owner-one','ABCDEFGHJK');
  await r.requestGroupPrivate('owner-one',r.issueGroupAccess('group-one'),'ABCDEFGHJK');await r.confirmGroup(id,token,'group-one');
  const b={memberOpenId:'member-one',uid:'123',name:'Viewer'},n={...b,id:randomUUID(),groupOpenId:'group-one'};
  const input={groupOpenId:'group-one',bindings:[b],notices:[n]};let attempts=0;
  const send=async()=>{attempts++;if(attempts===1)throw Error('temporary QQ failure');};
  assert.deepEqual((await r.syncIdentities(id,token,input,send)).delivered,[]);
  assert.equal(r.clients.get(id).members[0].bilibiliUid,'123');
  await r.syncIdentities(id,token,input,send);assert.equal(attempts,1);
  now+=60001;assert.deepEqual((await r.syncIdentities(id,token,input,send)).delivered,[n.id]);
  assert.equal(attempts,2);assert.equal(r.clients.get(id).identityLastError,'');
 }finally{r.shutdown();await rm(dir,{recursive:true,force:true});}
});
