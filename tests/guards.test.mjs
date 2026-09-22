import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,event,action,sorted,consolidateQueue} from '../server/core.mjs';
const setup=()=>{const s=defaults();s.settings.roomId='1';return s;};
const send=(s,uid,name,guardType,price=0,manual=false,now=1000,message='排队')=>event(s,{type:price?'gift':'message',uid,username:name,roomId:'1',message,price,guardType,id:crypto.randomUUID()},now,manual);
test('guard priority precedes gifts, equal guards use amount then arrival, lottery stays pinned',()=>{
 const s=setup();send(s,'n','n',0,100);send(s,'c','c',3,10);send(s,'a','a',2);send(s,'g','g',1,0.01);
 assert.deepEqual(sorted(s).map(x=>x.uid),['g','a','c','n']);send(s,'g2','g2',1,2);send(s,'g','g',1,1.99);assert.deepEqual(sorted(s).slice(0,2).map(x=>x.uid),['g','g2']);s.queue.find(x=>x.uid==='n').pin=1;assert.equal(sorted(s)[0].uid,'n');
});
test('guards bypass free toggle and gift minimum but pause still applies; explicit zero removes privilege',()=>{
 const s=setup();s.settings.freeQueue=false;s.settings.giftMinimum=5;
 for(const g of [1,2,3])send(s,''+g,''+g,g);
 send(s,'n','n',0);assert.equal(s.queue.length,3);send(s,'tiny','tiny',1,0.01);assert.equal(s.queue.length,4);
 send(s,'1','1',0,0,false,2000,'hello');assert.equal(s.queue.find(x=>x.uid==='1').guardType,0);
 s.settings.open=false;send(s,'paused','paused',1);assert.equal(s.queue.length,4);
});
test('manual and real entries merge both arrival orders summing contributions',()=>{
 for(const reverse of [false,true]){
  const s=setup();const manual=()=>send(s,'fake','Same',undefined,20,true,1000);const real=()=>send(s,'real','Same',3,10,false,2000);
  if(reverse){real();manual();}else{manual();real();}
  assert.equal(s.queue.length,1);assert.equal(s.queue[0].uid,'real');assert.equal(s.queue[0].cents,3000);assert.equal(s.queue[0].joinedAt,1000);assert.equal(s.queue[0].manual,false);assert.equal(s.queue[0].guardType,3);
  send(s,'real','Same',3,1,false,3000);assert.equal(s.queue[0].cents,3100);assert.equal(s.queue[0].joinedAt,1000);
 }
});
test('all same-name records merge automatically including legacy entries',()=>{
 const s=setup();send(s,'a','Same',0,2);send(s,'b','Same',0,3);assert.equal(s.queue.length,1);assert.equal(s.queue[0].uid,'b');assert.equal(s.queue[0].cents,500);
 const x=setup();x.queue=[{uid:'fake',username:'Name',cents:1000,order:1,joinedAt:1}];x.sequence=1;send(x,'real','Name',1,1);
 assert.equal(x.queue.length,1);assert.equal(x.queue[0].uid,'real');assert.equal(x.queue[0].cents,1100);
});
test('startup consolidation is idempotent and retains higher ranked arrival',()=>{
 const s=setup();s.queue=[{uid:'a',username:'Same',cents:200,order:1,joinedAt:10},{uid:'b',username:'Same',cents:500,order:2,joinedAt:20}];
 consolidateQueue(s);assert.equal(s.queue.length,1);assert.equal(s.queue[0].cents,700);assert.equal(s.queue[0].joinedAt,20);
 consolidateQueue(s);assert.equal(s.queue[0].cents,700);
});
test('manual current acquires real UID without rejoining or replaying TTS',()=>{
 const s=setup();send(s,'fake','Name',0,0,true);action(s,{type:'advance',currentUid:null,nextUid:'fake'});const id=s.announcement.id;
 send(s,'real','Name',1);assert.equal(s.current.uid,'real');assert.equal(s.queue.length,0);assert.equal(s.announcement.id,id);
});
