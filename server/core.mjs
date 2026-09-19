import { randomInt, randomUUID } from 'node:crypto';
import { normalizeLaplaceEvent } from './laplace.mjs';
export const defaults = () => ({ settings: {bridgeUrl:'ws://127.0.0.1:9696',bridgeToken:'',roomId:'',command:'排队',freeQueue:true,systemTts:false,streamChat:false,giftMinimum:0.1,lotteryPhrase:'抽奖',lotteryGift:'',lotterySeconds:60,lotteryGiftEnabled:true,open:true,speechLanguage:'zh-CN',overlayMode:'pages'},current:null,queue:[],sequence:0,drawSequence:0,lottery:null,announcement:null,history:[],seen:[] });
export function sorted(s) { return [...s.queue].sort((a,b)=>(b.pin||0)-(a.pin||0)||b.cents-a.cents||a.order-b.order); }
export function call(s) { const first=s.current; if(first) s.announcement={id:randomUUID(),uid:first.uid,text:s.settings.speechLanguage==='en-US'?`It is ${first.username}'s turn. Please get ready.`:`轮到 ${first.username} 了，请做好准备。`,language:s.settings.speechLanguage,at:Date.now()}; }
function change(s,fn) { fn(); }
function join(s,e,cents=0) { let item=s.queue.find(x=>x.uid===e.uid); if(!item){if(s.queue.length>=1000) throw Error('队列已满（1000 人）');item={uid:e.uid,username:e.username,cents:0,order:++s.sequence};s.queue.push(item);} item.username=e.username;item.cents+=cents;return item; }
export function finish(s,now=Date.now()) { if(!s.lottery?.active)return; change(s,()=>{const entries=s.lottery.entries.filter(x=>x.uid!==s.current?.uid);s.lottery.active=false;s.lottery.finishedAt=now;if(!entries.length){s.lottery.winner=null;return;}const winner=entries[randomInt(entries.length)];s.lottery.winner=winner;join(s,winner).pin=++s.drawSequence;}); }
export function event(s,raw,now=Date.now()) {
 if(s.lottery?.active && now>=s.lottery.endsAt)finish(s,now);
 const e=normalizeLaplaceEvent(raw);
 if(!e.uid || !s.settings.roomId || e.roomId!==s.settings.roomId)return false;
 if(!['message','gift','superchat'].includes(e.type))return false;
 const key=e.eventId?`${e.roomId}:${e.type}:${e.eventId}`:null;
 if(key && s.seen.includes(key))return false;
 if(key){s.seen.push(key);s.seen=s.seen.slice(-20000);}
 if(e.uid===s.current?.uid)return true;
 const gift=['gift','superchat'].includes(e.type)&&e.price>0;
 const cents=Math.round(e.price*100);
 if(!Number.isSafeInteger(cents)||cents<0)return false;
 change(s,()=>{
  const l=s.lottery;
  if(l?.active && ((e.type==='message'&&e.message.trim()===l.phrase)||(gift&&l.giftEnabled&&e.price>=l.minimum&&(!l.gift||e.giftName===l.gift)))) {
   if(!l.entries.some(x=>x.uid===e.uid))l.entries.push({uid:e.uid,username:e.username});
  }
  if(s.settings.open && ((s.settings.freeQueue&&e.type==='message'&&e.message.trim()===s.settings.command)||(gift&&cents>=Math.round(Math.max(0.1,s.settings.giftMinimum)*100))))join(s,e,gift?cents:0);
 });return true;
}
export function action(s,a) {
 if(a.type==='settings'){
  const next={...s.settings}; delete next.autoCall;
  if (a.settings?.speechLanguage && !['zh-CN','en-US'].includes(a.settings.speechLanguage)) throw Error('Invalid speech language / 语音语言无效');
  for(const k of Object.keys(next))if(k in (a.settings||{}))next[k]=a.settings[k];
  if(!['pages','scroll'].includes(next.overlayMode))throw Error('Invalid overlay mode / 挂件显示模式无效');
  if(!['zh-CN','en-US'].includes(next.speechLanguage))throw Error('Invalid speech language / 语音语言无效');
  for(const k of ['command','lotteryPhrase','roomId','bridgeUrl','bridgeToken','lotteryGift'])if(typeof next[k]!=='string'||next[k].length>500)throw Error('设置文本无效');
  if(next.roomId && !/^\d{1,16}$/.test(next.roomId))throw Error('直播间 ID 需要为数字');
  if(!next.command.trim()||!next.lotteryPhrase.trim())throw Error('口令不能为空');
  const u=new URL(next.bridgeUrl);if(!['ws:','wss:'].includes(u.protocol))throw Error('桥接地址需要 ws:// 或 wss://');
  for(const k of ['open','lotteryGiftEnabled','freeQueue','systemTts','streamChat'])if(typeof next[k]!=='boolean')throw Error('开关无效');
  if(!Number.isFinite(next.giftMinimum)||next.giftMinimum<0.1||next.giftMinimum>100000)throw Error('最低礼物金额应为 0.10–100000');
  if(!Number.isInteger(next.lotterySeconds)||next.lotterySeconds<5||next.lotterySeconds>86400)throw Error('抽奖时长应为 5–86400 秒');
  next.command=next.command.trim();next.lotteryPhrase=next.lotteryPhrase.trim();s.settings=next;
 }else if(a.type==='remove')change(s,()=>{const item=s.queue.find(x=>x.uid===a.uid);if(item){s.history.unshift({...item,removedAt:Date.now()});s.history=s.history.slice(0,100);s.queue=s.queue.filter(x=>x!==item);}});
 else if(a.type==='advance') {
  const next=sorted(s)[0]||null;
  if((a.currentUid??null)!==(s.current?.uid??null)||(a.nextUid??null)!==(next?.uid??null))throw Error('Queue changed. Please retry / 队列已变化，请重试');
  if(s.current){s.history.unshift({...s.current,removedAt:Date.now()});s.history=s.history.slice(0,100);}
  s.current=next?{...next,calledAt:Date.now()}:null;
  if(next)s.queue=s.queue.filter(x=>x.uid!==next.uid);
  s.announcement=null;call(s);
 }
 else if(a.type==='call')call(s);
 else if(a.type==='start'){
  if(!s.settings.roomId)throw Error('请先设置直播间 ID');
  if(s.lottery?.active)throw Error('抽奖正在进行');
  s.lottery={active:true,endsAt:Date.now()+s.settings.lotterySeconds*1000,entries:[],phrase:s.settings.lotteryPhrase,gift:s.settings.lotteryGift,giftEnabled:s.settings.lotteryGiftEnabled,minimum:s.settings.giftMinimum};
 }else if(a.type==='finish')finish(s);
 else if(a.type==='cancel'){if(s.lottery)s.lottery.active=false;}
 else throw Error('未知操作');
}
export function publicState(s){return {current:s.current||null,queue:sorted(s),lottery:s.lottery?{...s.lottery,entries:undefined,count:s.lottery.entries.length}:null,announcement:s.announcement,settings:{overlayMode:s.settings.overlayMode,speechLanguage:s.settings.speechLanguage,command:s.settings.command,open:s.settings.open,freeQueue:s.settings.freeQueue,giftMinimum:Math.max(0.1,s.settings.giftMinimum)}};}
