import test from 'node:test';
import assert from 'node:assert/strict';
import { GuardRoster } from '../server/guards.mjs';
import { defaults,event,sorted } from '../server/core.mjs';

test('complete paginated roster grants fleet queue priority and revokes expired members without chat',async()=>{
  let now=1000,expired=false;
  const roster=new GuardRoster({now:()=>now,request:async url=>{
    if(url.includes('room_init'))return {code:0,data:{uid:99,room_id:446277}};
    const page=new URL(url).searchParams.get('page');
    return {code:0,data:{info:{num:expired?0:3,page:expired?1:2},top3:expired?[]:[{uid:1,username:'总督',guard_level:1}],list:expired?[]:page==='1'?[{uid:2,guard_level:2}]:[{uid:3,guard_level:3}]}};
  }});
  await roster.refresh('446277');assert.equal(roster.status('446277').count,3);
  const s=defaults();s.settings.roomId='446277';s.settings.freeQueue=false;
  for(const uid of ['3','2','1'])event(s,{type:'message',source:'qq',uid,username:uid,roomId:'446277',message:'排队',guardType:roster.level('446277',uid)},now);
  event(s,{type:'gift',uid:'4',username:'4',roomId:'446277',price:100},now);
  assert.deepEqual(sorted(s).map(x=>x.uid),['1','2','3','4']);
  expired=true;now+=60_000;await roster.refresh('446277');
  for(const item of s.queue)item.guardType=roster.level('446277',item.uid);
  assert.deepEqual(sorted(s).map(x=>x.uid),['4','3','2','1']);
  assert.equal(roster.level('other','1'),0);
});
test('partial/error responses never replace a full roster; stale privileges eventually stop',async()=>{
  let now=1000,bad=false;
  const roster=new GuardRoster({now:()=>now,request:async url=>{
    if(url.includes('room_init'))return {code:0,data:{uid:9,room_id:1}};
    return {code:0,data:{info:{num:bad?20:1,page:1},top3:[{uid:123,guard_level:3}],list:[]}};
  }});
  await roster.refresh('1');assert.equal(roster.level('1','123'),3);
  bad=true;now+=60_000;await roster.refresh('1');assert.match(roster.error,/不完整/);assert.equal(roster.level('1','123'),3);
  now+=300_000;assert.equal(roster.level('1','123'),0);
  await roster.refresh('2');assert.equal(roster.level('2','123'),0);
});
