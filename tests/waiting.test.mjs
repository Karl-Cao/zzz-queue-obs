import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,event,action,sorted,finish} from '../server/core.mjs';
import {waitingTime} from '../public/queue-overlay.js';
const send=(s,uid,now,price=0)=>event(s,{type:price?'gift':'message',uid,username:uid,roomId:'1',message:'排队',price,id:crypto.randomUUID()},now);
test('equal amounts use first arrival; gifts and repeated chat preserve arrival',()=>{
 const s=defaults();s.settings.roomId='1';send(s,'a',1000);send(s,'b',2000,2);send(s,'a',3000,2);send(s,'a',4000);
 assert.deepEqual(sorted(s).map(x=>x.uid),['a','b']);assert.equal(s.queue[0].joinedAt,1000);
 action(s,{type:'remove',uid:'a'});send(s,'a',5000,2);assert.equal(s.queue.find(x=>x.uid==='a').joinedAt,5000);
 assert.deepEqual(sorted(s).map(x=>x.uid),['b','a']);
 action(s,{type:'undo',id:s.undo.id});assert.equal(s.queue.find(x=>x.uid==='a').joinedAt,1000);
});
test('lottery preserves existing arrival and timestamps a new winner',()=>{
 const s=defaults();s.settings.roomId='1';send(s,'a',1000);
 s.lottery={active:true,entries:[{uid:'a',username:'a'}]};finish(s,2000);assert.equal(s.queue[0].joinedAt,1000);
 s.lottery={active:true,entries:[{uid:'b',username:'b'}]};finish(s,3000);assert.equal(sorted(s)[0].joinedAt,3000);
});
test('wait formatting handles hours, unknown legacy entries and freezes at call',()=>{
 assert.equal(waitingTime({joinedAt:1000},62000),'1:01');assert.equal(waitingTime({joinedAt:1000},3662000),'1:01:01');
 assert.equal(waitingTime({},62000),null);assert.equal(waitingTime({joinedAt:1000,calledAt:62000},999999),'1:01');
});
