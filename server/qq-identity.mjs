import { randomInt, randomUUID } from 'node:crypto';
import { normalizeLaplaceEvent } from './laplace.mjs';

export class QQIdentity {
  constructor(state) { this.state=state; state.qqIdentities ||= {}; state.qqIdentityOutbox ||= []; this.pending=new Map(); this.observed=new Map(); }
  key(group,member) { return `${group}:${member}`; }
  command(group,member,text,room,now=Date.now()) {
    const key=this.key(group,member), bound=this.state.qqIdentities[key];
    if(text==='解绑B站') { this.state.qqIdentityOutbox=this.state.qqIdentityOutbox.filter(x=>!(x.groupOpenId===group&&x.memberOpenId===member)); delete this.state.qqIdentities[key]; this.pending.delete(key); return {reply:'已解除本群的 B站绑定。',clearIdentity:true}; }
    if(text==='查看绑定'&&this.pending.has(key)){const p=this.pending.get(key);if(p.expiresAt>now)return {reply:`本次验证尚未完成。请在直播间 ${p.room} 发送：绑定${p.code}。${bound?`原绑定 UID ${bound.uid} 仍保留。`:''}主播助手必须收到这条真实弹幕。`};this.pending.delete(key);}
    if(text==='查看绑定') return {reply:bound?`已验证 B站 UID：${bound.uid}，昵称：${bound.name}。舰队身份由主播端自动同步本直播间的舰队名单。`:'尚未验证 UID。请发送：@机器人 /绑定B站（无需填写UID），再按提示发送验证弹幕',...(bound?{verifiedIdentity:bound}:{})};
    const uid=/^绑定B站\s+([1-9]\d{0,19})$/.exec(text)?.[1];
    if(text!=='绑定B站'&&!uid)return null;
    if(uid&&Object.entries(this.state.qqIdentities).some(([k,b])=>k.startsWith(group+':')&&k!==key&&b.uid===uid))return {reply:'这个 B站 UID 已被本群其他 QQ 成员绑定。'};
    let code;do{code=String(randomInt(100000,1000000));}while([...this.pending.values()].some(p=>p.expiresAt>now&&p.code===code));
    this.pending.set(key,{uid,room:String(room),code,expiresAt:now+5*60_000});
    return {reply:`请在5分钟内用你要绑定的 B站账号向直播间 ${room} 发送短弹幕：绑定${code}（只需“绑定”加6位数字，不加空格）。助手收到后会自动在QQ群回复验证成功，无需发送 /查看绑定。`};
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
      if(p.room!==String(room)||(p.uid&&p.uid!==e.uid)||e.type!=='message'||![`绑定${p.code}`,`绑定QQ ${p.code}`].includes(e.message.trim()))continue;
      const group=key.slice(0,key.lastIndexOf(':'));
      if(Object.entries(this.state.qqIdentities).some(([k,b])=>k.startsWith(group+':')&&k!==key&&b.uid===e.uid))continue;
      this.state.qqIdentities[key]={uid:e.uid,name:e.username};
      this.state.qqIdentityOutbox=(this.state.qqIdentityOutbox||[]).filter(x=>!(x.groupOpenId===group&&x.memberOpenId===key.slice(key.lastIndexOf(':')+1)));
      this.state.qqIdentityOutbox.push({id:randomUUID(),groupOpenId:group,memberOpenId:key.slice(key.lastIndexOf(':')+1),uid:e.uid,name:e.username});this.pending.delete(key);
    }
  }
  identity(group,member,room,now=Date.now()) {
    const b=this.state.qqIdentities[this.key(group,member)];
    if(!b)return null;
    const o=this.observed.get(`${room}:${b.uid}`);
    return {...b,name:o?.name||b.name,guardType:0};
  }
}
