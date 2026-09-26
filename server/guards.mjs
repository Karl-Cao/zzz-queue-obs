const REFRESH_MS=60_000, MAX_STALE_MS=5*60_000;
export class GuardRoster {
  constructor({request=async url=>{const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0',Referer:'https://live.bilibili.com/'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();},now=()=>Date.now(),apiOrigin='https://api.live.bilibili.com'}={}) {
    this.request=request;this.apiOrigin=apiOrigin;this.now=now;this.members=new Map();this.room='';this.updatedAt=0;this.error='';this.lastAttempt=0;
  }
  status(room) {return {roomId:this.room,updatedAt:this.updatedAt||null,count:this.members.size,error:this.error,usable:this.room===String(room)&&Boolean(this.updatedAt)&&this.now()-this.updatedAt<MAX_STALE_MS};}
  level(room,uid) {return this.status(room).usable?(this.members.get(String(uid))?.guardType||0):0;}
  async refresh(room,force=false) {
    room=String(room||'');if(!/^\d{1,16}$/.test(room))return;
    if(this.inflight) {await this.inflight;if(this.room!==room)return this.refresh(room,force);return;}
    if(!force&&this.room===room&&this.now()-this.lastAttempt<REFRESH_MS)return;
    if(this.room!==room){this.room=room;this.members.clear();this.updatedAt=0;this.lastAttempt=0;}
    this.lastAttempt=this.now();
    this.inflight=this.fetchRoom(room).catch(e=>{this.error=`舰队同步失败：${e.message}`;}).finally(()=>{this.inflight=null;});
    await this.inflight;
  }
  async fetchRoom(room) {
    const init=await this.request(`${this.apiOrigin}/room/v1/Room/room_init?id=${room}`);
    if(init.code!==0||!init.data?.uid||!init.data?.room_id)throw Error('直播间信息无效');
    const members=new Map(),seen=new Set();let pages=1,total=0;
    for(let page=1;page<=pages;page++) {
      const data=await this.request(`${this.apiOrigin}/xlive/app-room/v2/guardTab/topList?roomid=${init.data.room_id}&ruid=${init.data.uid}&page=${page}&page_size=29`);
      const d=data.data;
      if(data.code!==0||!d?.info||!Array.isArray(d.list)||!Array.isArray(d.top3))throw Error('舰队接口返回无效，未覆盖旧名单');
      const count=Number(d.info.num),pageCount=Number(d.info.page);
      if(!Number.isInteger(count)||count<0||!Number.isInteger(pageCount)||pageCount<1||pageCount>100)throw Error('舰队分页无效或超过100页');
      if(page===1){total=count;pages=pageCount;}else if(total!==count||pages!==pageCount)throw Error('名单在翻页期间变化，将稍后重新同步');
      for(const row of [...d.top3,...d.list]) {
        const uid=String(row.uid||''),tier=Number(row.guard_level);
        if(!/^[1-9]\d{0,19}$/.test(uid)||![0,1,2,3].includes(tier))throw Error('舰队身份字段不完整');
        seen.add(uid);if(tier)members.set(uid,{guardType:tier,name:String(row.username||'')});
      }
    }
    if(seen.size<total)throw Error('舰队名单不完整，未覆盖旧名单');
    this.members=members;this.updatedAt=this.now();this.error='';
  }
}
