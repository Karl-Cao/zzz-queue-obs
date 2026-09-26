import test from 'node:test';
import assert from 'node:assert/strict';
import { QQIdentity } from '../server/qq-identity.mjs';
import { defaults,event,sorted } from '../server/core.mjs';

const live=(uid,message,guardType=3,roomId='room')=>({type:'message',uid,username:'B站'+uid,message,guardType,roomId});
function proof(q,member='member',uid='123',now=1000) {
  q.command('group',member,`绑定B站 ${uid}`,'room',now);
  return `绑定QQ ${q.pending.get(q.key('group',member)).code}`;
}
test('UID binding needs matching live account, room, code and deadline',()=>{
  const s=defaults(),q=new QQIdentity(s),code=proof(q);
  q.observe(live('999',code),'room',1001);assert.equal(q.identity('group','member','room',1002),null);
  q.observe(live('123',code,3,'other'),'room',1001);assert.equal(q.identity('group','member','room',1002),null);
  q.observe({...live('123',code),source:'qq'},'room',1001);assert.equal(q.identity('group','member','room',1002),null);
  q.observe(live('123',code),'room',1002);assert.equal(q.identity('group','member','room',1003).uid,'123');
  const expired=proof(q,'second','456');q.observe(live('456',expired),'room',301001);assert.equal(q.identity('group','second','room',301002),null);
  assert.match(q.command('group','second','绑定B站 123','room',1003).reply,/已被/);
});
test('verified identity alone cannot grant fleet privileges',()=>{
  const s=defaults();s.settings.roomId='room';s.settings.freeQueue=false;const q=new QQIdentity(s);
  for(const [member,uid,tier] of [['a','101',1],['b','102',2],['c','103',3]]){
    const code=proof(q,member,uid);q.observe(live(uid,code,tier),'room',1001);
    const b=q.identity('group',member,'room',1002);
    event(s,{...live(b.uid,'排队',b.guardType),source:'qq'},1002);
  }
  event(s,{type:'gift',uid:'999',username:'普通',price:1000,roomId:'room'},1003);
  assert.deepEqual(sorted(s).map(x=>x.uid),['999']);
});
test('bindings persist without retaining chat fleet privileges',()=>{
  const s=defaults(),q=new QQIdentity(s),code=proof(q);q.observe(live('123',code),'room',1001);
  assert.equal(q.identity('group','member','other',1002).guardType,0);
  assert.equal(q.identity('group','member','room',901001).guardType,0);
  const restarted=new QQIdentity(JSON.parse(JSON.stringify(s)));
  assert.equal(restarted.identity('group','member','room',1002).uid,'123');
  assert.equal(restarted.identity('group','member','room',1002).guardType,0);
  q.observe(live('123','hello',0),'room',1002);assert.equal(q.identity('group','member','room',1003).guardType,0);
  assert.equal(q.identity('other-group','member','room',1003),null);
  q.command('group','member','解绑B站','room');assert.equal(q.identity('group','member','room'),null);
});
