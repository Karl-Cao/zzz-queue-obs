import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from '../server/core.mjs';
import {queueListReply} from '../server/queue-list.mjs';

test('queue list is read-only, respects guard/value/arrival order and marks pending claims',()=>{
  const s=defaults();s.settings.roomId='446277';
  s.current={uid:'1',username:'当前用户',cents:0};
  s.queue=[{uid:'2',username:'普通',cents:6000,order:1},
    {uid:'3',username:'舰长',guardType:3,cents:0,order:2},
    {uid:'4',username:'后来的舰长',guardType:3,cents:0,order:3}];
  s.redPackets=[{id:'pending',uid:'3',username:'舰长',status:'pending',roomId:'446277',cents:6000}];
  const before=JSON.stringify(s),reply=queueListReply(s);
  assert.match(reply,/当前：当前用户 · ¥0.00/);
  assert.match(reply,/1\. 舰长 · ¥0.00（红包待核对）[\s\S]*2\. 后来的舰长[\s\S]*3\. 普通 · ¥60.00/);
  assert.equal(JSON.stringify(s),before);
});
test('empty and long queues have explicit, bounded output',()=>{
  const s=defaults();assert.match(queueListReply(s),/暂无等待观众/);
  s.queue=Array.from({length:25},(_,i)=>({uid:String(i),username:'人'+i,cents:0,order:i}));
  const reply=queueListReply(s);assert.match(reply,/等待队列（25人）/);assert.match(reply,/其余 5 人/);
  assert.doesNotMatch(reply,/21\./);
});
