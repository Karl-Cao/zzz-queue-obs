import { randomUUID } from 'node:crypto';
import { normalizeLaplaceEvent } from './laplace.mjs';

export class ChatFeed {
  constructor() { this.items = []; this.seen = new Set(); }
  add(raw, room, now = Date.now()) {
    const e = normalizeLaplaceEvent(raw);
    if (!room || e.roomId !== room || !e.uid || !['message', 'gift', 'superchat'].includes(e.type)) return false;
    const key = e.eventId ? `${room}:${e.type}:${e.eventId}` : randomUUID();
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value);
    this.items.unshift({ id: key, at: now, type: e.type, uid: e.uid.slice(0,100), username: e.username.slice(0,100), message: e.message.slice(0,2000), giftName: e.giftName.slice(0,100), amount: e.price, valuationMissing: e.valuationMissing, valuationSource: e.valuationSource, quantity: e.giftAmount });
    this.items.length = Math.min(this.items.length, 200); return true;
  }
  clear() { this.items = []; this.seen.clear(); }
}
