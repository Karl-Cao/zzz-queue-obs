import { randomInt, randomUUID } from 'node:crypto';
import { normalizeLaplaceEvent } from './laplace.mjs';
export const defaults = () => ({ settings: {bridgeUrl:'ws://127.0.0.1:9696',bridgeToken:'',roomId:'',command:'排队',freeQueue:true,systemTts:false,streamChat:false,giftMinimum:0.1,lotteryPhrase:'抽奖',lotteryGift:'',lotterySeconds:60,lotteryGiftEnabled:true,open:true,speechLanguage:'zh-CN',overlayMode:'pages',overlayPageSeconds:6,overlayScrollSpeed:18,overlayFontSize:15,overlayShowAmount:true},current:null,queue:[],sequence:0,drawSequence:0,lottery:null,announcement:null,history:[],seen:[] });
const guardRank=x=>[1,2,3].includes(x.guardType)?4-x.guardType:0;
const compare=(a,b)=>(b.pin||0)-(a.pin||0)||guardRank(b)-guardRank(a)||b.cents-a.cents||a.order-b.order;
export function sorted(s) { return [...s.queue].sort(compare); }
function reconcile(s,e,manual=false){
 const candidates=s.queue.filter(x=>x.uid===e.uid||(e.username&&e.username!=='Unknown viewer'&&x.username===e.username));
 if(!candidates.length)return;
 const known=candidates.find(x=>x.manual===false);
 const authority=manual?(known||e):e;
 const identity=authority.guardType;
 for(const x of candidates)if(identity!==undefined)x.guardType=identity;
 const winner=[...candidates].sort(compare)[0];
 const cents=candidates.reduce((total,x)=>total+x.cents,0);
 if(!Number.isSafeInteger(cents))throw Error('Combined amount too large / 合并金额过大');
 const merged={...winner,cents,uid:authority.uid,username:e.username,manual:manual?!known:false};
 const changed=candidates.length>1||winner.uid!==merged.uid;
 if(candidates.length===1)Object.assign(winner,merged);
 else {s.queue=s.queue.filter(x=>!candidates.includes(x));s.queue.push(merged);}
 if(changed){
  s.undo=null;
  if(s.lottery){
   for(const x of s.lottery.entries||[])if(candidates.some(m=>m.uid===x.uid))x.uid=merged.uid;
   s.lottery.entries=s.lottery.entries.filter((x,i,a)=>a.findIndex(y=>y.uid===x.uid)===i);
  }
 }
}
export function consolidateQueue(s){
 for(const item of [...s.queue])if(s.queue.includes(item))reconcile(s,item,true);
}
export function call(s) { const first=s.current; if(first) s.announcement={id:randomUUID(),uid:first.uid,text:s.settings.speechLanguage==='en-US'?`It is ${first.username}'s turn. Please get ready.`:`轮到 ${first.username} 了，请做好准备。`,language:s.settings.speechLanguage,at:Date.now()}; }
function change(s,fn) { fn(); }
function join(s,e,cents=0,now=Date.now()) { let item=s.queue.find(x=>x.uid===e.uid); if(!item){if(s.queue.length>=1000) throw Error('队列已满（1000 人）');item={uid:e.uid,username:e.username,cents:0,order:++s.sequence,joinedAt:now,manual:!!e.manual,guardType:e.guardType??0};s.queue.push(item);} item.username=e.username;if(e.guardType!==undefined)item.guardType=e.guardType;item.cents+=cents;return item; }
export function finish(s,now=Date.now()) { if(!s.lottery?.active)return; change(s,()=>{const entries=s.lottery.entries.filter(x=>x.uid!==s.current?.uid);s.lottery.active=false;s.lottery.finishedAt=now;if(!entries.length){s.lottery.winner=null;return;}const winner=entries[randomInt(entries.length)];s.lottery.winner=winner;join(s,winner,0,now).pin=++s.drawSequence;}); }
export function event(s,raw,now=Date.now(),manual=false) {
 if(s.lottery?.active && now>=s.lottery.endsAt)finish(s,now);
 let e=normalizeLaplaceEvent(raw);
 if(!e.uid || !s.settings.roomId || e.roomId!==s.settings.roomId)return false;
 if(!['message','gift','superchat'].includes(e.type))return false;
 const key=e.eventId?`${e.roomId}:${e.type}:${e.eventId}`:null;
 if(key && s.seen.includes(key))return false;
 if(key){s.seen.push(key);s.seen=s.seen.slice(-20000);}
 if(!manual&&s.current&&s.current.username===e.username&&e.username!=='Unknown viewer'){
  s.current.uid=e.uid;s.current.manual=false;if(e.guardType!==undefined)s.current.guardType=e.guardType;
  const duplicates=s.queue.filter(x=>x.uid===e.uid||x.username===e.username);
  s.current.cents+=duplicates.reduce((total,x)=>total+x.cents,0);
  s.queue=s.queue.filter(x=>!duplicates.includes(x));s.undo=null;
  if(s.announcement)s.announcement.uid=e.uid;
 }
 if(e.uid===s.current?.uid){if(e.guardType!==undefined)s.current.guardType=e.guardType;return true;}
 e={...e,manual};
 const existing=s.queue.find(x=>x.uid===e.uid);
 if(existing&&e.guardType!==undefined)existing.guardType=e.guardType;
 const member=guardRank(e.guardType===undefined?(existing||{}):e)>0;
 const gift=['gift','superchat'].includes(e.type)&&e.price>0;
 const cents=Math.round(e.price*100);
 if(!Number.isSafeInteger(cents)||cents<0)return false;
 change(s,()=>{
  const l=s.lottery;
  const entrant=l?.entries.find(x=>x.uid===e.uid);if(entrant&&e.guardType!==undefined)entrant.guardType=e.guardType;
  if(l?.active && ((e.type==='message'&&e.message.trim()===l.phrase)||(gift&&l.giftEnabled&&e.price>=l.minimum&&(!l.gift||e.giftName===l.gift)))) {
   if(!l.entries.some(x=>x.uid===e.uid))l.entries.push({uid:e.uid,username:e.username,guardType:e.guardType??existing?.guardType??0,manual:!!e.manual});
  }
  if(s.settings.open && (((s.settings.freeQueue||member||manual)&&e.type==='message'&&e.message.trim()===s.settings.command)||(gift&&cents>0&&(member||cents>=Math.round(Math.max(0.1,s.settings.giftMinimum)*100)))))join(s,e,gift?cents:0,now);
 });
 reconcile(s,e,manual);
 return true;
}
function remember(s,type,item,next){s.undo={id:randomUUID(),type,item:item?structuredClone(item):null,next:next?structuredClone(next):null,expiresAt:Date.now()+20000};}
function restore(s,item){if(!item)return;const existing=s.queue.find(x=>x.uid===item.uid);if(existing){existing.cents+=item.cents;existing.joinedAt=Number.isFinite(item.joinedAt)?Math.min(item.joinedAt,existing.joinedAt??Infinity):undefined;existing.order=Math.min(existing.order,item.order);existing.pin=Math.max(existing.pin||0,item.pin||0);}else s.queue.push({...item});}
export function action(s,a) {
 if(a.type==='undo'){
  const u=s.undo;if(!u||a.id!==u.id||Date.now()>u.expiresAt)throw Error('Undo expired / 撤销已过期');
  if(u.type==='advance'){
   if((s.current?.uid||null)!==(u.next?.uid||null)||u.item&&s.queue.some(x=>x.uid===u.item.uid))throw Error('Queue changed; cannot undo / 队列已变化，无法撤销');
   restore(s,s.current);s.current=u.item;s.announcement=null;
  }else restore(s,u.item);
  s.history=s.history.filter(x=>x.operationId!==u.id);s.undo=null;return;
 }

 if(a.type==='settings'){
  const next={...s.settings}; delete next.autoCall;
  if (a.settings?.speechLanguage && !['zh-CN','en-US'].includes(a.settings.speechLanguage)) throw Error('Invalid speech language / 语音语言无效');
  for(const k of Object.keys(next))if(k in (a.settings||{}))next[k]=a.settings[k];
  for(const [key,min,max] of [['overlayPageSeconds',3,30],['overlayScrollSpeed',5,60],['overlayFontSize',12,24]])if(!Number.isInteger(next[key])||next[key]<min||next[key]>max)throw Error('Invalid overlay setting / 挂件设置超出范围');
  if(typeof next.overlayShowAmount!=='boolean')throw Error('Invalid amount visibility');
  if(!['pages','scroll'].includes(next.overlayMode))throw Error('Invalid overlay mode / 挂件显示模式无效');
  if(!['zh-CN','en-US'].includes(next.speechLanguage))throw Error('Invalid speech language / 语音语言无效');
  for(const k of ['command','lotteryPhrase','roomId','bridgeUrl','bridgeToken','lotteryGift'])if(typeof next[k]!=='string'||next[k].length>500)throw Error('设置文本无效');
  if(next.roomId && !/^\d{1,16}$/.test(next.roomId))throw Error('直播间 ID 需要为数字');
  if(!next.command.trim()||!next.lotteryPhrase.trim())throw Error('口令不能为空');
  const u=new URL(next.bridgeUrl);if(!['ws:','wss:'].includes(u.protocol))throw Error('桥接地址需要 ws:// 或 wss://');
  for(const k of ['open','lotteryGiftEnabled','freeQueue','systemTts','streamChat'])if(typeof next[k]!=='boolean')throw Error('开关无效');
  if(!Number.isFinite(next.giftMinimum)||next.giftMinimum<0.1||next.giftMinimum>100000)throw Error('最低礼物金额应为 0.10–100000');
  if(!Number.isInteger(next.lotterySeconds)||next.lotterySeconds<5||next.lotterySeconds>86400)throw Error('抽奖时长应为 5–86400 秒');
  if(next.roomId!==s.settings.roomId)s.undo=null;
  next.command=next.command.trim();next.lotteryPhrase=next.lotteryPhrase.trim();s.settings=next;
 }else if(a.type==='remove')change(s,()=>{const item=s.queue.find(x=>x.uid===a.uid);if(item){remember(s,'remove',item);s.history.unshift({...item,operationId:s.undo.id,removedAt:Date.now()});s.history=s.history.slice(0,100);s.queue=s.queue.filter(x=>x!==item);}});
 else if(a.type==='advance') {
  const next=sorted(s)[0]||null;
  if((a.currentUid??null)!==(s.current?.uid??null)||(a.nextUid??null)!==(next?.uid??null))throw Error('Queue changed. Please retry / 队列已变化，请重试');
  remember(s,'advance',s.current,next);
  if(s.current){s.history.unshift({...s.current,operationId:s.undo.id,removedAt:Date.now()});s.history=s.history.slice(0,100);}
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
export function publicState(s){return {current:s.current||null,queue:sorted(s),lottery:s.lottery?{...s.lottery,entries:undefined,count:s.lottery.entries.length}:null,announcement:s.announcement,settings:{overlayPageSeconds:s.settings.overlayPageSeconds,overlayScrollSpeed:s.settings.overlayScrollSpeed,overlayFontSize:s.settings.overlayFontSize,overlayShowAmount:s.settings.overlayShowAmount,overlayMode:s.settings.overlayMode,speechLanguage:s.settings.speechLanguage,command:s.settings.command,open:s.settings.open,freeQueue:s.settings.freeQueue,giftMinimum:Math.max(0.1,s.settings.giftMinimum)}};}
