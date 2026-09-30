import {normalizeLaplaceEvent} from './laplace.mjs';
export class EventDiagnostics {
 constructor(){this.gifts=[];}
 process(state,raw,apply,now=Date.now()){
  const e=normalizeLaplaceEvent(raw);if(e.type!=='gift')return apply();
  const matches=x=>x.uid===e.uid||(e.username!=='Unknown viewer'&&x.username===e.username);
  const amount=()=>[...state.queue,...(state.current?[state.current]:[])].filter(matches).reduce((sum,x)=>sum+x.cents,0);
  const before=amount(),duplicate=e.eventId&&state.seen.includes(`${e.roomId}:${e.type}:${e.eventId}`);
  let accepted=false,error=false;
  try{accepted=apply();return accepted;}catch(failure){error=true;throw failure;}
  finally{
   const after=amount();
   const reason=error?'error':!e.uid?'missing-uid':e.roomId!==state.settings.roomId?'wrong-room':duplicate?'duplicate':after>before?'credited':e.price<=0?'no-value':state.current&&matches(state.current)?'current':!accepted?'ignored':'not-credited';
   this.gifts.unshift({at:now,username:e.username.slice(0,80),giftName:e.giftName.slice(0,80),roomId:e.roomId.slice(0,20),value:e.price,creditedCents:Math.max(0,after-before),reason});
   this.gifts.length=Math.min(5,this.gifts.length);
  }
 }
}
