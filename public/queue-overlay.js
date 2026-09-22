export const PAGE_SIZE=4, PAGE_MS=6000, ROW_HEIGHT=48, HOLD_MS=2000, SCROLL_PX_PER_SECOND=18;
export function frame(mode,count,elapsed,viewport=192,options={}){
 const rowHeight=options.rowHeight||ROW_HEIGHT,pageMs=(options.overlayPageSeconds||6)*1000,speed=options.overlayScrollSpeed||SCROLL_PX_PER_SECOND;
 const pageSize=Math.max(1,Math.floor(viewport/rowHeight));
 const pages=Math.max(1,Math.ceil(count/pageSize));
 if(mode!=='scroll')return {pageSize,page:Math.floor(elapsed/pageMs)%pages,pages,offset:0};
 const distance=Math.max(0,count*rowHeight-viewport);
 if(!distance)return {pageSize,page:0,pages,offset:0};
 const travel=distance/speed*1000,phase=elapsed%(travel+HOLD_MS*2);
 return {pageSize,page:0,pages,offset:phase<HOLD_MS?0:Math.min(distance,(phase-HOLD_MS)/1000*speed)};
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function guardLabel(person,lang='zh'){return (lang==='en'?['','Governor','Admiral','Captain']:['','总督','提督','舰长'])[person.guardType]||'';}
export function waitingTime(person,now=Date.now()){
 if(!Number.isFinite(person.joinedAt))return null;
 const seconds=Math.max(0,Math.floor(((person.calledAt??now)-person.joinedAt)/1000));
 return seconds>=3600?`${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`:`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
export class QueueOverlay{
 constructor({root,lang}){this.root=root;this.t=(zh,en)=>lang==='en'?en:zh;this.queue=root.querySelector('#queue');this.footer=root.querySelector('#queue-footer');this.viewport=root.querySelector('#queue-window');this.height=this.viewport.clientHeight||192;this.observer=new ResizeObserver(()=>{const height=this.viewport.clientHeight;if(height>0&&height!==this.height){this.height=height;this.start=performance.now();this.page=-1;this.paint(performance.now(),true);}});this.observer.observe(this.viewport);this.signature='';this.page=-1;this.start=performance.now();this.tick=this.tick.bind(this);this.raf=requestAnimationFrame(this.tick);}
 row(person,index){return `<div class="viewer"><span class="position">${index==null?'▶':String(index+1).padStart(2,'0')}</span><strong title="${escape(person.username)}">${escape(person.username)}${guardLabel(person)?` <span class="guard-badge">${this.t(guardLabel(person),guardLabel(person,'en'))}</span>`:''}</strong>${person.pin?`<span class="winner" title="${this.t('抽奖中奖','Lottery winner')}">★</span>`:''}<span class="viewer-details">${this.state?.settings.overlayShowAmount===false?'':`<span class="amount">¥${(person.cents/100).toFixed(2)}</span>`}<span class="wait-time">${waitingTime(person)===null?this.t('等待时间未知','Wait unknown'):this.t(person.calledAt?'已等待 ':'等待 ',person.calledAt?'Waited ':'Wait ')+waitingTime(person)}</span></span></div>`;}
 update(state){
  const now=performance.now(),old=this.state;
  const signature=JSON.stringify([state.current?.uid,state.current?.calledAt,state.settings.overlayMode,state.settings.overlayPageSeconds,state.settings.overlayScrollSpeed,state.settings.overlayFontSize]);
  if(old&&signature===this.signature&&old.queue.map(x=>x.uid).join(',')!==state.queue.map(x=>x.uid).join(',')){
   const elapsed=now-this.start,view=frame(old.settings.overlayMode,old.queue.length,elapsed,this.height,{...old.settings,rowHeight:this.rowHeight});
   const index=old.settings.overlayMode==='scroll'?Math.floor(view.offset/this.rowHeight):view.page*view.pageSize;
   const uid=old.queue[index]?.uid,found=state.queue.findIndex(x=>x.uid===uid),anchor=found<0?Math.min(index,Math.max(0,state.queue.length-1)):found;
   const phase=old.settings.overlayMode==='scroll'?HOLD_MS+(anchor*this.rowHeight+view.offset%this.rowHeight)/(old.settings.overlayScrollSpeed||18)*1000:Math.floor(anchor/view.pageSize)*(old.settings.overlayPageSeconds||6)*1000+elapsed%((old.settings.overlayPageSeconds||6)*1000);
   this.start=now-phase;
  }
  this.state=state;this.rowHeight=Math.max(48,(state.settings.overlayFontSize||15)*2+18);
  this.root.style.setProperty('--viewer-row',this.rowHeight+'px');this.root.style.setProperty('--viewer-font',(state.settings.overlayFontSize||15)+'px');
  if(signature!==this.signature){this.signature=signature;this.start=performance.now();this.page=-1;}
  this.root.querySelector('#current').innerHTML=state.current?this.row(state.current,null):`<div class="no-current">${this.t('暂无当前观众','No current viewer')}</div>`;
  this.root.querySelector('#waiting-total').textContent=this.t(`${state.queue.length} 人等待`,`${state.queue.length} waiting`);
  // Refresh names/amounts without resetting animation on each server heartbeat.
  this.paint(performance.now(),true);
 }
 paint(now,force=false){
  if(!this.state)return;
  const {queue,settings}=this.state,mode=settings.overlayMode||'pages';
  const view=frame(mode,queue.length,Math.max(0,now-this.start),this.height,{...settings,rowHeight:this.rowHeight});
  const second=Math.floor(Date.now()/1000);
  if(force||this.page!==view.page||this.second!==second){
   this.second=second;
   if(this.state.current)this.root.querySelector('#current').innerHTML=this.row(this.state.current,null);
   const first=mode==='scroll'?0:view.page*view.pageSize,items=mode==='scroll'?queue:queue.slice(first,first+view.pageSize);
   this.queue.innerHTML=items.length?items.map((x,i)=>this.row(x,first+i)).join(''):`<div class="queue-empty">${this.t('等待观众加入','Waiting for viewers')}</div>`;
   this.page=view.page;
  }
  this.queue.style.transform=`translateY(${-view.offset}px)`;
  const text=!queue.length?this.t('队列为空','Queue is empty'):mode==='scroll'?(queue.length*this.rowHeight>this.height?this.t('自动滚动','Auto scroll'):this.t('全部已显示','All viewers shown')):this.t(`第 ${view.page+1}/${view.pages} 页 · 每页 ${view.pageSize} 人`,`Page ${view.page+1}/${view.pages} · ${view.pageSize} per page`);
  if(this.footer.textContent!==text)this.footer.textContent=text;
 }
 tick(now){this.paint(now);this.raf=requestAnimationFrame(this.tick);}
 destroy(){this.observer.disconnect();cancelAnimationFrame(this.raf);}
}
