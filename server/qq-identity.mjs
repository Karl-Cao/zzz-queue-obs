import { randomBytes } from 'node:crypto';
import { normalizeLaplaceEvent } from './laplace.mjs';

export class QQIdentity {
  constructor(state) { this.state=state; state.qqIdentities ||= {}; this.pending=new Map(); this.observed=new Map(); }
  key(group,member) { return `${group}:${member}`; }
  command(group,member,text,room,now=Date.now()) {
    const key=this.key(group,member), bound=this.state.qqIdentities[key];
    if(text==='解绑B站') { delete this.state.qqIdentities[key]; this.pending.delete(key); return {reply:'已解除本群的 B站绑定。',clearIdentity:true}; }
    if(text==='查看绑定') return {reply:bound?`已验证 B站 UID：${bound.uid}，昵称：${bound.name}。舰队身份由主播端自动同步本直播间的舰队名单。`:'尚未验证 UID。请发送：@机器人 /绑定B站 你的B站UID',...(bound?{verifiedIdentity:bound}:{})};
    const uid=/^绑定B站\s+([1-9]\d{0,19})$/.exec(text)?.[1];
    if(!uid)return null;
    if(Object.entries(this.state.qqIdentities).some(([k,b])=>k.startsWith(group+':')&&k!==key&&b.uid===uid))return {reply:'这个 B站 UID 已被本群其他 QQ 成员绑定。'};
    const code=randomBytes(6).toString('hex').toUpperCase();
    this.pending.set(key,{uid,room:String(room),code,expiresAt:now+5*60_000});
    return {reply:`请在5分钟内用 B站 UID ${uid} 向直播间 ${room} 发送弹幕：绑定QQ ${code}。发送后在群里 /查看绑定。`};
  }
  observe(raw,room,now=Date.now()) {
    if(raw.source==='qq')return;
    const e=normalizeLaplaceEvent(raw);
    if(e.roomId!==String(room)||!e.uid||!['message','gift','superchat'].includes(e.type))return;
    const observationKey=`${room}:${e.uid}`, previous=this.observed.get(observationKey)||{};
    this.observed.delete(observationKey);
    this.observed.set(observationKey,{...previous,room:String(room),name:e.username});
    if(this.observed.size>10000)this.observed.delete(this.observed.keys().next().value);
    for(const [key,p] of this.pending) {
      if(p.expiresAt<=now){this.pending.delete(key);continue;}
      if(p.room!==String(room)||p.uid!==e.uid||e.type!=='message'||e.message.trim()!==`绑定QQ ${p.code}`)continue;
      const group=key.slice(0,key.lastIndexOf(':'));
      if(Object.entries(this.state.qqIdentities).some(([k,b])=>k.startsWith(group+':')&&k!==key&&b.uid===e.uid))continue;
      this.state.qqIdentities[key]={uid:e.uid,name:e.username}; this.pending.delete(key);
    }
  }
  identity(group,member,room,now=Date.now()) {
    const b=this.state.qqIdentities[this.key(group,member)];
    if(!b)return null;
    const o=this.observed.get(`${room}:${b.uid}`);
    return {...b,name:o?.name||b.name,guardType:0};
  }
}
