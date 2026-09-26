import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,action,call} from '../server/core.mjs';
import {callWords} from '../server/call-words.mjs';
test('independent voice and QQ words substitute names safely and retain default language',()=>{
  const s=defaults();s.current={uid:'123',username:'Alice {uid}'};
  action(s,{type:'settings',settings:{voiceCallTemplate:'{name}，请入场。',qqCallTemplate:'准备好了吗，{name}？用户码{uid}'}});call(s);
  assert.equal(s.announcement.text,'Alice {uid}，请入场。');assert.equal(s.announcement.qqText,'准备好了吗，Alice {uid}？用户码123');
  assert.match(callWords('',{username:'Alice',uid:'1'},'en-US'),/Alice.*turn/);
  assert.throws(()=>action(s,{type:'settings',settings:{qqCallTemplate:'x'.repeat(301)}}));
});
