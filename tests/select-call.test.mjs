import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,action} from '../server/core.mjs';
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
