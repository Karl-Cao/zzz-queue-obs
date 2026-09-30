import test from 'node:test';import assert from 'node:assert/strict';
import {EventDiagnostics} from '../server/event-diagnostics.mjs';
import {defaults,event,action,publicState} from '../server/core.mjs';
import {submitRedPacket} from '../server/red-packets.mjs';
import {QueueOverlay} from '../public/queue-overlay.js';
test('gift diagnostic and overlay cover returned current viewer, legacy QQ UID merge and pending red packet',()=>{
 const s=defaults();s.settings.roomId='1';s.settings.giftMinimum=1;
 s.current={uid:'qq:legacy',username:'园林之王',cents:100,joinedAt:1000,order:1,calledAt:2000};
 s.queue=Array.from({length:5},(_,i)=>({uid:String(i+10),username:'Viewer '+i,cents:200,joinedAt:1100+i,order:i+2}));
 action(s,{type:'select-call',uid:'10',currentUid:'qq:legacy'});
 submitRedPacket(s,{id:'claim',uid:'123',username:'园林之王',memberOpenId:'member-one',groupOpenId:'group',roomId:'1',amount:'2'},3000);
 const d=new EventDiagnostics(),g={type:'gift',origin:'1',uid:'123',username:'园林之王',giftName:'粉丝团灯牌',priceNormalized:0.1,coinType:'gold',giftId:'1',id:'unique-gift'};
 assert.equal(d.process(s,g,()=>event(s,g,3100),3100),true);
 const row=publicState(s).queue.find(x=>x.uid==='123');assert.equal(row.cents,110);assert.equal(row.joinedAt,1000);assert.equal(row.hasPendingRedPacket,true);
 const html=QueueOverlay.prototype.row.call({t:zh=>zh,state:{settings:{}}},row,4);
 assert.match(html,/待核对/);assert.match(html,/¥1.10/);assert.match(html,/园林之王/);
 assert.equal(d.gifts[0].reason,'credited');assert.equal(d.gifts[0].creditedCents,10);
 d.process(s,g,()=>event(s,g,3101),3101);assert.equal(d.gifts[0].reason,'duplicate');assert.equal(row.cents,110);
 action(s,{type:'red-confirm',id:'claim',identity:{uid:'123',username:'园林之王',verified:true}});
 assert.equal(publicState(s).queue[0].cents,310);assert.equal(publicState(s).queue[0].hasPendingRedPacket,undefined);
});
test('gift diagnostic distinguishes bridge payload rejection, zero value and processing failure',()=>{
 const s=defaults();s.settings.roomId='1';const d=new EventDiagnostics();
 for(const [raw,reason] of [[{roomId:'2',uid:'123',price:1},'wrong-room'],[{roomId:'1',price:1},'missing-uid'],[{roomId:'1',uid:'123',price:0},'no-value']]){
  const g={type:'gift',username:'Viewer',giftName:'Gift',...raw};d.process(s,g,()=>event(s,g));assert.equal(d.gifts[0].reason,reason);
 }
 assert.throws(()=>d.process(s,{type:'gift',uid:'123',roomId:'1'},()=>{throw Error('failure');}));assert.equal(d.gifts[0].reason,'error');
});
