export function amountCents(value) {
  if(typeof value!=='string'||!/^\d{1,6}(?:\.\d{1,2})?$/.test(value.trim()))throw Error('金额请填写人民币数字，最多两位小数，例如 /红包排队 1.50');
  const [yuan,fraction='']=value.trim().split('.'),cents=Number(yuan)*100+Number(fraction.padEnd(2,'0'));
  if(cents<1||cents>10_000_000)throw Error('红包金额须为 0.01–100000 元');
  return cents;
}
export function submitRedPacket(s,claim,now=Date.now()) {
  s.redPackets ||= [];
  const previous=s.redPackets.find(x=>x.id===claim.id);
  if(previous)return {claim:previous,duplicate:true};
  if(s.seen.includes(`red-packet:${claim.id}`))throw Error('这条红包申请已处理，请勿重复提交');
  if(!s.settings.open)throw Error('主播排队已暂停，暂不接受红包排队申请');
  const pending=s.redPackets.filter(x=>x.status==='pending');
  if(pending.length>=500||pending.filter(x=>x.memberOpenId===claim.memberOpenId&&x.groupOpenId===claim.groupOpenId).length>=3)throw Error('待核对申请过多，请等待主播处理');
  const item={...claim,cents:amountCents(claim.amount),status:'pending',submittedAt:now,order:++s.sequence};delete item.amount;
  s.redPackets=[...s.redPackets.filter(x=>x.status==='pending'),...s.redPackets.filter(x=>x.status!=='pending').slice(-200),item];
  s.seen.push(`red-packet:${claim.id}`);s.seen=s.seen.slice(-20000);
  return {claim:item,duplicate:false};
}
export function pendingQueue(s) {
  const rows=[];
  for(const claim of (s.redPackets||[]).filter(x=>x.status==='pending'&&x.roomId===s.settings.roomId).sort((a,b)=>a.order-b.order)) {
    if([...s.queue,...(s.current?[s.current]:[]),...rows].some(x=>x.uid===claim.uid||x.username===claim.username))continue;
    rows.push({uid:claim.uid,username:claim.username,cents:0,guardType:0,source:'qq',order:claim.order,joinedAt:claim.submittedAt,pendingRedPacket:true,claimId:claim.id});
  }
  return rows;
}
export function resolveRedPacket(s,id,amount,credit,now=Date.now()) {
  const claim=s.redPackets?.find(x=>x.id===id);
  if(!claim||claim.status!=='pending')throw Error('红包申请已处理或不存在，请刷新');
  if(claim.roomId!==s.settings.roomId)throw Error('此申请属于另一个直播间，请核对房间设置');
  const cents=amount===undefined?claim.cents:amountCents(amount);
  credit(claim,cents);
  claim.status='confirmed';claim.confirmedCents=cents;claim.resolvedAt=now;
  s.undo=null;
}
export function rejectRedPacket(s,id,now=Date.now()) {
  const claim=s.redPackets?.find(x=>x.id===id);
  if(!claim||claim.status!=='pending')throw Error('红包申请已处理或不存在，请刷新');
  claim.status='rejected';claim.resolvedAt=now;
}
