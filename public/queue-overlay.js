export const PAGE_SIZE=4, PAGE_MS=6000, ROW_HEIGHT=48, HOLD_MS=2000, SCROLL_PX_PER_SECOND=18;
export function frame(mode,count,elapsed,viewport=192){
 const pages=Math.max(1,Math.ceil(count/PAGE_SIZE));
 if(mode!=='scroll')return {page:Math.floor(elapsed/PAGE_MS)%pages,pages,offset:0};
 const distance=Math.max(0,count*ROW_HEIGHT-viewport);
 if(!distance)return {page:0,pages,offset:0};
 const travel=distance/SCROLL_PX_PER_SECOND*1000,phase=elapsed%(travel+HOLD_MS*2);
 return {page:0,pages,offset:phase<HOLD_MS?0:Math.min(distance,(phase-HOLD_MS)/1000*SCROLL_PX_PER_SECOND)};
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class QueueOverlay{
 constructor({root,lang}){this.root=root;this.t=(zh,en)=>lang==='en'?en:zh;this.queue=root.querySelector('#queue');this.footer=root.querySelector('#queue-footer');this.signature='';this.page=-1;this.start=performance.now();this.tick=this.tick.bind(this);this.raf=requestAnimationFrame(this.tick);}
 row(person,index){return `<div class="viewer"><span class="position">${index==null?'▶':String(index+1).padStart(2,'0')}</span><strong title="${escape(person.username)}">${escape(person.username)}</strong>${person.pin?`<span class="winner" title="${this.t('抽奖中奖','Lottery winner')}">★</span>`:''}<span class="amount">¥${(person.cents/100).toFixed(2)}</span></div>`;}
 update(state){
  this.state=state;
  const signature=JSON.stringify([state.current?.uid,state.current?.calledAt,state.settings.overlayMode,state.queue.map(x=>x.uid)]);
  if(signature!==this.signature){this.signature=signature;this.start=performance.now();this.page=-1;}
  this.root.querySelector('#current').innerHTML=state.current?this.row(state.current,null):`<div class="no-current">${this.t('暂无当前观众','No current viewer')}</div>`;
  this.root.querySelector('#waiting-total').textContent=this.t(`${state.queue.length} 人等待`,`${state.queue.length} waiting`);
  // Refresh names/amounts without resetting animation on each server heartbeat.
  this.paint(performance.now(),true);
 }
 paint(now,force=false){
  if(!this.state)return;
  const {queue,settings}=this.state,mode=settings.overlayMode||'pages';
  const view=frame(mode,queue.length,Math.max(0,now-this.start));
  if(force||this.page!==view.page){
   const first=mode==='scroll'?0:view.page*PAGE_SIZE,items=mode==='scroll'?queue:queue.slice(first,first+PAGE_SIZE);
   this.queue.innerHTML=items.length?items.map((x,i)=>this.row(x,first+i)).join(''):`<div class="queue-empty">${this.t('等待观众加入','Waiting for viewers')}</div>`;
   this.page=view.page;
  }
  this.queue.style.transform=`translateY(${-view.offset}px)`;
  const text=!queue.length?this.t('队列为空','Queue is empty'):mode==='scroll'?(queue.length>PAGE_SIZE?this.t('自动滚动','Auto scroll'):this.t('全部已显示','All viewers shown')):this.t(`第 ${view.page+1}/${view.pages} 页 · 每页 4 人`,`Page ${view.page+1}/${view.pages} · 4 per page`);
  if(this.footer.textContent!==text)this.footer.textContent=text;
 }
 tick(now){this.paint(now);this.raf=requestAnimationFrame(this.tick);}
 destroy(){cancelAnimationFrame(this.raf);}
}
