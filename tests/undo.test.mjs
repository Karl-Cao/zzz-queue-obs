import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,event,action,publicState} from '../server/core.mjs';
const setup=()=>{const s=defaults();s.settings.roomId='1';return s;};
const gift=(s,uid,price)=>event(s,{type:'gift',uid,username:uid,roomId:'1',price,id:crypto.randomUUID()});
test('undo removal restores original contribution while keeping subsequent gifts and joins',()=>{
 const s=setup();gift(s,'a',2);action(s,{type:'remove',uid:'a'});const id=s.undo.id;gift(s,'a',3);gift(s,'b',1);
 action(s,{type:'undo',id});assert.equal(s.queue.find(x=>x.uid==='a').cents,500);assert.equal(s.queue.length,2);assert.equal(s.history.length,0);assert.equal(s.undo,null);
});
test('undo advance restores previous current without replaying voice or discarding new entries',()=>{
 const s=setup();gift(s,'a',2);gift(s,'b',1);action(s,{type:'advance',currentUid:null,nextUid:'a'});
 action(s,{type:'advance',currentUid:'a',nextUid:'b'});const id=s.undo.id;gift(s,'c',5);
 action(s,{type:'undo',id});assert.equal(s.current.uid,'a');assert.deepEqual(s.queue.map(x=>x.uid).sort(),['b','c']);assert.equal(s.announcement,null);assert.equal(s.history.length,0);assert.equal(publicState(s).undo,undefined);
});
test('undo rejects stale tokens, expiry and rejoined previous current without changing data',()=>{
 const s=setup();gift(s,'a',2);action(s,{type:'advance',currentUid:null,nextUid:'a'});action(s,{type:'advance',currentUid:'a',nextUid:null});
 const id=s.undo.id;gift(s,'a',4);const before=structuredClone(s);assert.throws(()=>action(s,{type:'undo',id}));assert.deepEqual(s,before);
 assert.throws(()=>action(s,{type:'undo',id:'old'}));s.undo.expiresAt=0;assert.throws(()=>action(s,{type:'undo',id}));
});
test('overlay customization is validated and exposed to the overlay',()=>{
 const s=setup();action(s,{type:'settings',settings:{overlayFontSize:24,overlayPageSeconds:12,overlayScrollSpeed:30,overlayShowAmount:false}});
 assert.equal(publicState(s).settings.overlayShowAmount,false);
 for(const settings of [{overlayFontSize:25},{overlayPageSeconds:0},{overlayScrollSpeed:100},{overlayShowAmount:1}])assert.throws(()=>action(s,{type:'settings',settings}));
});
