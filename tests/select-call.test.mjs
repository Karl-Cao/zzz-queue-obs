import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,action,event,publicState} from '../server/core.mjs';
test('selected viewer replaces current, preserves other ranks and can undo without replay',()=>{
 const s=defaults();s.current={uid:'old',username:'Previous',cents:100,order:0,joinedAt:5,calledAt:30};
 s.queue=[{uid:'first',username:'First',cents:200,order:1,joinedAt:10},{uid:'chosen',username:'Chosen',cents:100,order:2,joinedAt:20}];
 action(s,{type:'select-call',uid:'chosen',currentUid:'old'});
 assert.equal(s.current.uid,'chosen');assert.equal(s.current.joinedAt,20);assert.deepEqual(s.queue.map(x=>x.uid),['first','old']);assert.equal(s.queue[1].joinedAt,5);assert.equal(s.queue[1].calledAt,undefined);
 assert.match(s.announcement.text,/Chosen/);assert.match(s.announcement.qqText,/Chosen/);assert.equal(s.history.length,0);s.queue.find(x=>x.uid==='old').cents+=50;
 assert.throws(()=>action(s,{type:'select-call',uid:'first',currentUid:'old'}),/队列已变化/);
 action(s,{type:'undo',id:s.undo.id});assert.equal(s.current.uid,'old');assert.equal(s.current.cents,150);assert.equal(s.current.calledAt,30);assert.equal(s.announcement,null);assert.equal(s.queue.length,2);assert.equal(s.queue.find(x=>x.uid==='chosen').calledAt,undefined);
});
test('missing or pending-only viewer cannot be selected and does not finish current',()=>{
 const s=defaults();s.current={uid:'old',username:'Previous'};
 assert.throws(()=>action(s,{type:'select-call',uid:'pending',currentUid:'old'}),/不在等待队列/);
 assert.equal(s.current.uid,'old');assert.equal(s.announcement,null);
});

test('returned current viewer continues gift accumulation and ranking, including small gifts and paused entries',()=>{
 const s=defaults();s.settings.roomId='1';s.settings.giftMinimum=1;
 const gift=(uid,price,id)=>({type:'gift',uid,username:uid,price,roomId:'1',id});
 event(s,gift('old',1,'initial-old'),1000);event(s,gift('selected',1,'initial-selected'),1001);event(s,gift('other',2,'initial-other'),1002);
 action(s,{type:'select-call',uid:'old',currentUid:null});action(s,{type:'select-call',uid:'selected',currentUid:'old'});
 event(s,gift('old',0.1,'small-gift'),2000);assert.equal(s.queue.find(x=>x.uid==='old').cents,110);
 event(s,gift('old',2,'large-gift'),2001);assert.equal(publicState(s).queue[0].uid,'old');assert.equal(publicState(s).queue[0].cents,310);
 s.settings.open=false;event(s,gift('old',0.1,'paused-gift'),2002);
 assert.equal(publicState(s).queue[0].cents,320);assert.equal(publicState(s).queue[0].joinedAt,1000);assert.equal(publicState(s).queue[0].calledAt,undefined);
 assert.equal(s.current.uid,'selected');event(s,gift('new',10,'paused-new'),2003);assert.equal(s.queue.some(x=>x.uid==='new'),false);
});
