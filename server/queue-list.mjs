import { publicState } from './core.mjs';

// The same ordering and pending-payment markers as the viewer overlay.
export function queueListReply(state) {
  const {current, queue}=publicState(state);
  const name=item=>String(item.username||'观众').replace(/[\r\n\t]/g,' ').slice(0,80);
  const line=item=>`${name(item)} · ¥${(item.cents/100).toFixed(2)}${item.pendingRedPacket||item.hasPendingRedPacket?'（红包待核对）':''}`;
  return [
    `当前：${current?line(current):'暂无'}`,
    `等待队列（${queue.length}人）：`,
    ...(queue.length?queue.slice(0,20).map((item,index)=>`${index+1}. ${line(item)}`):['暂无等待观众']),
    ...(queue.length>20?[`其余 ${queue.length-20} 人请查看直播排队挂件。`]:[]),
    '以上为查询时的实时顺序，后续送礼或主播操作可能改变名次。',
  ].join('\n');
}
