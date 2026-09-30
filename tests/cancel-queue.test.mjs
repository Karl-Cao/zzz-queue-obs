import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,event,action,cancelQueue,publicState} from '../server/core.mjs';
import {submitRedPacket} from '../server/red-packets.mjs';
const setup=()=>{const s=defaults();s.settings.roomId='1';return s;};
const message=(uid,text,id='')=>({type:'message',uid,username:'Viewer '+uid,message:text,roomId:'1',id});
test('real chat cancellation is UID scoped and works when queue is paused or paid',()=>{
 const s=setup();event(s,message('1','排队'),1000);event(s,message('2','排队'),1001);
 s.settings.open=false;s.settings.freeQueue=false;
 event(s,{...message('999','取消排队'),username:'Viewer 1'},1002);assert.equal(s.queue.length,2);
 event(s,message('1','取消排队','cancel-1'),1003);assert.deepEqual(s.queue.map(x=>x.uid),['2']);
 event(s,message('1','取消排队','cancel-1'),1004);assert.equal(s.queue.length,1);
 assert.equal(cancelQueue(s,'1').cancelled,false);
});
test('self cancellation clears pending claims and undo, prevents lottery reentry, protects current task',()=>{
 const s=setup();event(s,message('1','排队'),1000);event(s,message('2','排队'),1001);
 action(s,{type:'advance',currentUid:null,nextUid:'1'});
 assert.equal(cancelQueue(s,'1').current,true);assert.equal(s.current.uid,'1');
 submitRedPacket(s,{id:'packet',uid:'2',username:'Viewer 2',memberOpenId:'member-two',groupOpenId:'group',roomId:'1',amount:'1'},1100);
 s.lottery={active:true,endsAt:100000,entries:[{uid:'2',username:'Viewer 2'}]};
 event(s,message('2','取消排队'),1200);
 assert.equal(publicState(s).queue.length,0);assert.equal(s.redPackets[0].status,'cancelled');
 assert.equal(s.undo,null);assert.equal(s.lottery.entries.length,0);
 assert.throws(()=>action(s,{type:'red-confirm',id:'packet'}));assert.equal(s.current.uid,'1');
});
