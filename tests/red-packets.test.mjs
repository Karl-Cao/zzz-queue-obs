import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,event,action,publicState,sorted} from '../server/core.mjs';
import {amountCents,submitRedPacket} from '../server/red-packets.mjs';
const setup=()=>{const s=defaults();s.settings.roomId='1';s.settings.freeQueue=false;return s;};
const claim=(id='request',uid='qq:member',amount='100')=>({id,uid,username:uid,memberOpenId:uid,groupOpenId:'group',roomId:'1',amount});
test('unverified claims stay last with zero credit and cannot trigger calling or lottery entry',()=>{
 const s=setup();submitRedPacket(s,claim(),1000);
 event(s,{type:'gift',uid:'paid',username:'paid',price:1,roomId:'1'},2000);
 const rows=publicState(s).queue;assert.equal(rows[0].uid,'paid');assert.equal(rows[1].pendingRedPacket,true);assert.equal(rows[1].cents,0);
 action(s,{type:'advance',currentUid:null,nextUid:'paid'});assert.equal(s.current.uid,'paid');
 action(s,{type:'advance',currentUid:'paid',nextUid:null});assert.equal(s.current,null);assert.equal(s.announcement,null);
 action(s,{type:'start'});assert.equal(s.lottery.entries.length,0);
 action(s,{type:'red-confirm',id:'request',amount:'1.50'});assert.equal(sorted(s)[0].cents,150);assert.equal(sorted(s)[0].joinedAt,1000);assert.equal(s.announcement,null);
 assert.equal(publicState(s).queue.length,1);assert.equal(publicState(s).queue[0].pendingRedPacket,undefined);
 assert.throws(()=>action(s,{type:'red-confirm',id:'request'}));assert.equal(s.queue[0].cents,150);
});
test('confirmed claims merge amounts, retain established waiting time and current seat',()=>{
 const s=setup();event(s,{type:'gift',uid:'123',username:'Alice',price:2,roomId:'1'},1000);
 const p={...claim('a','123','10'),username:'Alice'};submitRedPacket(s,p,2000);
 assert.equal(publicState(s).queue.length,1);
 action(s,{type:'red-confirm',id:'a',identity:{uid:'123',username:'Alice',guardType:3,verified:true}});
 assert.equal(s.queue[0].cents,1200);assert.equal(s.queue[0].joinedAt,1000);assert.equal(s.queue[0].guardType,3);
 action(s,{type:'advance',currentUid:null,nextUid:'123'});const announcement=s.announcement.id;
 submitRedPacket(s,{...p,id:'b'},3000);action(s,{type:'red-confirm',id:'b'});
 assert.equal(s.current.cents,2200);assert.equal(s.queue.length,0);assert.equal(s.announcement.id,announcement);
});
test('rejection, retry deduplication, claim limits and cross-room checks protect existing entries',()=>{
 const s=setup();submitRedPacket(s,claim('a'),1000);assert.equal(submitRedPacket(s,claim('a'),2000).duplicate,true);
 action(s,{type:'red-reject',id:'a'});assert.equal(publicState(s).queue.length,0);assert.equal(s.redPackets[0].status,'rejected');
 submitRedPacket(s,claim('b'),2000);s.settings.roomId='2';assert.throws(()=>action(s,{type:'red-confirm',id:'b'}));s.settings.roomId='1';
 submitRedPacket(s,claim('c'),2000);submitRedPacket(s,claim('d'),2000);assert.throws(()=>submitRedPacket(s,claim('e'),2000));
 s.settings.open=false;assert.throws(()=>submitRedPacket(s,claim('f','other'),2000));
 for(const input of ['0','-1','1.001','Infinity','100001','1e3','1元',''])assert.throws(()=>amountCents(input));
 assert.equal(amountCents('0.01'),1);assert.equal(amountCents('1.1'),110);
});
