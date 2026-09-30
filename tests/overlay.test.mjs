import test from 'node:test';
import assert from 'node:assert/strict';
import {QueueOverlay,frame,PAGE_MS,HOLD_MS,SCROLL_PX_PER_SECOND} from '../public/queue-overlay.js';
import {defaults,action,publicState} from '../server/core.mjs';
test('paging covers all 20 viewers, last partial page and loops',()=>{
 assert.equal(frame('pages',20,0).pages,5);
 assert.equal(frame('pages',20,PAGE_MS*4).page,4);
 assert.equal(frame('pages',20,PAGE_MS*5).page,0);
 assert.equal(frame('pages',10,PAGE_MS*2).page,2);
 for(const count of [0,1,4])assert.equal(frame('pages',count,999999).page,0);
});
test('scroll holds both ends, reveals last row and loops; short queues stay still',()=>{
 const distance=20*48-192,travel=distance/SCROLL_PX_PER_SECOND*1000;
 assert.equal(frame('scroll',20,HOLD_MS-1).offset,0);
 assert.equal(frame('scroll',20,HOLD_MS+1000).offset,18);
 assert.equal(frame('scroll',20,HOLD_MS+travel+100).offset,distance);
 assert.equal(frame('scroll',20,HOLD_MS*2+travel).offset,0);
 for(const count of [0,1,4])assert.equal(frame('scroll',count,50000).offset,0);
});
test('display mode persists in settings, is public and rejects invalid changes',()=>{
 const s=defaults();assert.equal(s.settings.overlayMode,'pages');
 action(s,{type:'settings',settings:{overlayMode:'scroll'}});assert.equal(publicState(s).settings.overlayMode,'scroll');
 assert.throws(()=>action(s,{type:'settings',settings:{overlayMode:'bad'}}));assert.equal(s.settings.overlayMode,'scroll');
});
test('page capacity and scroll distance adapt to viewport height',()=>{
 assert.equal(frame('pages',20,0,480).pageSize,10);
 assert.equal(frame('pages',20,6000,480).page,1);
 assert.equal(frame('pages',20,0,960).pages,1);
 assert.equal(frame('pages',20,0,239).pageSize,4);
 assert.equal(frame('pages',20,0,1).pageSize,1);
 assert.equal(frame('scroll',20,999999,960).offset,0);
 const travel=(960-480)/SCROLL_PX_PER_SECOND*1000;
 assert.equal(frame('scroll',20,HOLD_MS+travel+1,480).offset,480);
});

test('queue overlay only flags unbound current or waiting viewers without leaking IDs',()=>{
 const s=defaults();s.settings.qqEnabled=true;s.settings.qqMode='public';s.settings.qqGroupOpenId='group-one';
 s.qqIdentities={'group-one:member-A':{uid:'123',name:'Bound viewer'},'other-group:member-B':{uid:'456',name:'Other group viewer'}};
 s.current={uid:'123',username:'Bound viewer',cents:0,order:1,joinedAt:1000};
 s.queue=[{uid:'456',username:'Other group viewer',cents:0,order:2,joinedAt:1001}];
 const snapshot=publicState(s),view=lang=>({t:(zh,en)=>lang==='en'?en:zh,state:{settings:{}}});
 assert.equal(snapshot.current.qqBound,true);assert.equal(snapshot.queue[0].qqBound,false);
 assert.doesNotMatch(QueueOverlay.prototype.row.call(view('zh'),snapshot.current,null),/已绑定|未绑定/);
 assert.match(QueueOverlay.prototype.row.call(view('zh'),snapshot.queue[0],0),/未绑定/);
 assert.match(QueueOverlay.prototype.row.call(view('en'),snapshot.queue[0],0),/Unbound/);
 assert.doesNotMatch(JSON.stringify(snapshot),/member-A|member-B|group-one/);
 s.settings.qqEnabled=false;
 assert.equal(publicState(s).current.qqBound,undefined);
 assert.doesNotMatch(QueueOverlay.prototype.row.call(view('zh'),publicState(s).current,null),/已绑定|未绑定/);
});
