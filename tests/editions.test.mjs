import test from 'node:test'; import assert from 'node:assert/strict';
import { defaults, event, action, publicState } from '../server/core.mjs';
import { ChatFeed } from '../server/chat.mjs';
import { bridgeExecutable } from '../server/bridge.mjs';
const configured = () => { const s = defaults(); s.settings.roomId = '123'; return s; };
const chat = (uid, message = '排队') => ({ type:'message', uid, username:uid, message, roomId:'123' });
const gift = (uid, price, other = {}) => ({ type:'gift', uid, username:uid, priceNormalized:price, roomId:'123', ...other });
test('免费排队开关关闭后拒绝免费弹幕、低于 0.1 元和银瓜子，付费正常累计', () => {
  const s = configured(); action(s,{type:'settings',settings:{freeQueue:false}});
  event(s,chat('free')); event(s,gift('low',.09)); event(s,gift('silver',1,{coinType:'silver'})); assert.equal(s.queue.length,0);
  event(s,gift('paid',.1)); event(s,gift('paid',2)); assert.equal(s.queue[0].cents,210);
  action(s,{type:'settings',settings:{freeQueue:true}}); event(s,chat('free')); assert.equal(s.queue.length,2);
  action(s,{type:'settings',settings:{freeQueue:false}}); assert.equal(s.queue.length,2);
  action(s,{type:'remove',uid:'paid'}); event(s,chat('paid')); assert.equal(s.queue.length,1);
  assert.equal(publicState(s).settings.freeQueue,false);
});
test('免费关闭仍允许主播抽奖中奖入队；最低门槛不能调至 0.1 以下', () => {
  const s=configured();s.settings.freeQueue=false;action(s,{type:'start'});event(s,chat('winner','抽奖'));action(s,{type:'finish'});assert.equal(s.queue[0].uid,'winner');
  assert.throws(()=>action(s,{type:'settings',settings:{giftMinimum:.01}}));assert.throws(()=>action(s,{type:'settings',settings:{freeQueue:'false'}}));
});
test('新安装不预填主播房间，不接收未配置房间的事件', () => {
  const s=defaults();assert.equal(s.settings.roomId,'');event(s,gift('a',1));assert.equal(s.queue.length,0);assert.throws(()=>action(s,{type:'start'}));
});
test('弹幕面板过滤房间、去重、保留最近 200 条', () => {
  const feed=new ChatFeed();feed.add({...chat('a'),id:'same'},'123');feed.add({...chat('a'),id:'same'},'123');assert.equal(feed.items.length,1);
  feed.add({...chat('b'),roomId:'999'},'123');assert.equal(feed.items.length,1);
  for(let i=0;i<220;i++)feed.add({...chat(String(i)),id:String(i)},'123');assert.equal(feed.items.length,200);assert.equal(feed.items[0].uid,'219');feed.clear();assert.equal(feed.items.length,0);
});
test('桥接程序相对安装目录定位，不依赖原电脑路径', () => { if(!process.env.LAPLACE_BRIDGE_EXE)assert.match(bridgeExecutable(), /vendor[\\/]leb-server-windows-x64\.exe$/); });
