import test from 'node:test';
import assert from 'node:assert/strict';
import {frame,PAGE_MS,HOLD_MS,SCROLL_PX_PER_SECOND} from '../public/queue-overlay.js';
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
