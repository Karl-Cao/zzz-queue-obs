import test from 'node:test';import assert from 'node:assert/strict';
import {defaults as baseDefaults,event,sorted,action,finish,publicState} from '../server/core.mjs';
const defaults=()=>{const s=baseDefaults();s.settings.roomId='446277';return s;};
const gift=(uid,price,id=crypto.randomUUID())=>({type:'gift',uid,username:uid,price,id,roomId:'446277'});
test('累计金额、同额先到先排、移除清零',()=>{const s=defaults();event(s,gift('a',1));event(s,gift('b',2));assert.equal(sorted(s)[0].uid,'b');event(s,gift('a',2));assert.equal(sorted(s)[0].uid,'a');assert.equal(sorted(s)[0].cents,300);action(s,{type:'remove',uid:'a'});event(s,gift('a',1));assert.equal(sorted(s)[0].uid,'b');assert.equal(s.queue.find(x=>x.uid==='a').cents,100);event(s,gift('a',1));assert.equal(sorted(s)[0].uid,'b');});
test('重复礼物去重，过滤其他房间和银瓜子',()=>{const s=defaults(),g=gift('a',1,'same');event(s,g);event(s,g);event(s,{...gift('b',10),roomId:'other'});event(s,{...gift('b',10),roomId:''});event(s,{...gift('c',10),coinType:'silver'});assert.equal(s.queue.length,1);assert.equal(s.queue[0].cents,100);});
test('弹幕精确匹配、同 UID 去重',()=>{const s=defaults();for(const message of ['排队','排队','不排队'])event(s,{type:'message',uid:'a',username:'A',message,roomId:'446277'});assert.equal(s.queue.length,1);});
test('中奖置顶直到移除，礼物不能超越',()=>{const s=defaults();event(s,gift('a',1));action(s,{type:'start'});event(s,{type:'message',uid:'b',username:'B',message:'抽奖',roomId:'446277'});event(s,{type:'message',uid:'b',username:'B',message:'抽奖',roomId:'446277'});assert.equal(s.lottery.entries.length,1);finish(s);event(s,gift('a',100));assert.equal(sorted(s)[0].uid,'b');action(s,{type:'remove',uid:'b'});assert.equal(sorted(s)[0].uid,'a');});
test('截止后不能参加，空抽奖安全结束',()=>{const s=defaults();action(s,{type:'start'});event(s,{type:'message',uid:'a',username:'A',message:'抽奖',roomId:'446277'},s.lottery.endsAt);assert.equal(s.lottery.active,false);assert.equal(s.lottery.winner,null);assert.equal(s.queue.length,0);});
test('指定礼物和抽奖配置快照',()=>{const s=defaults();s.settings.lotteryGift='灯牌';action(s,{type:'start'});event(s,{...gift('a',1),giftName:'其他'});event(s,{...gift('b',1),giftName:'灯牌'});assert.deepEqual(s.lottery.entries.map(x=>x.uid),['b']);});
test('公开挂件不暴露令牌，错误设置不修改状态',()=>{const s=defaults();s.settings.bridgeToken='secret';assert.ok(!JSON.stringify(publicState(s)).includes('secret'));assert.throws(()=>action(s,{type:'settings',settings:{lotterySeconds:-1}}));assert.equal(s.settings.lotterySeconds,60);});
test('LAPLACE 金瓜子单位和归一化金额兼容',()=>{const s=defaults();event(s,{...gift('a',1000),coinType:'gold'});event(s,{...gift('b',1000),priceNormalized:2,coinType:'gold'});assert.equal(s.queue[0].cents,100);assert.equal(s.queue[1].cents,200);});

test('等待队列变化及中奖不叫号，手动推进隔离当前并防止重复推进',()=>{
 const s=defaults();event(s,gift('a',1));event(s,gift('b',2));assert.equal(s.announcement,null);assert.equal(s.current,null);
 action(s,{type:'advance',currentUid:null,nextUid:'b'});assert.equal(s.current.uid,'b');assert.equal(s.announcement.uid,'b');const id=s.announcement.id;
 assert.throws(()=>action(s,{type:'advance',currentUid:null,nextUid:'b'}));event(s,gift('a',9));assert.equal(s.current.uid,'b');assert.equal(s.announcement.id,id);
 event(s,gift('b',99));assert.equal(s.queue.some(x=>x.uid==='b'),false);
 action(s,{type:'start'});event(s,{type:'message',uid:'winner',username:'Winner',message:'抽奖',roomId:'446277'});finish(s);
 assert.equal(sorted(s)[0].uid,'winner');assert.equal(s.current.uid,'b');assert.equal(s.announcement.id,id);
 action(s,{type:'advance',currentUid:'b',nextUid:'winner'});assert.equal(s.current.uid,'winner');assert.equal(s.history[0].uid,'b');assert.equal(s.announcement.uid,'winner');
 action(s,{type:'remove',uid:'a'});const before=s.announcement.id;assert.equal(s.current.uid,'winner');assert.equal(s.announcement.id,before);
 action(s,{type:'advance',currentUid:'winner',nextUid:null});assert.equal(s.current,null);assert.equal(s.announcement,null);assert.equal(s.history[0].uid,'winner');
});
test('英文叫号只播当前；未叫号时重播无效',()=>{const s=defaults();s.settings.speechLanguage='en-US';event(s,gift('Alice',1));action(s,{type:'call'});assert.equal(s.announcement,null);action(s,{type:'advance',currentUid:null,nextUid:'Alice'});assert.match(s.announcement.text,/Alice.*turn/);assert.equal(publicState(s).current.uid,'Alice');});
test('抽奖参与者成为当前后不能再次中奖入队',()=>{const s=defaults();event(s,gift('a',1));action(s,{type:'start'});event(s,{type:'message',uid:'a',username:'A',message:'抽奖',roomId:'446277'});action(s,{type:'advance',currentUid:null,nextUid:'a'});finish(s);assert.equal(s.lottery.winner,null);assert.equal(s.queue.length,0);assert.equal(s.current.uid,'a');});
test('非法语音语言不修改设置',()=>{const s=defaults();for(const speechLanguage of ['',null,'fr-FR'])assert.throws(()=>action(s,{type:'settings',settings:{speechLanguage}}));assert.equal(s.settings.speechLanguage,'zh-CN');});
