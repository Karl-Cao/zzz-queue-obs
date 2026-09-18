import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
export function normalizeGifts(raw) {
  const list = raw?.data?.list || raw?.gifts;
  if (!Array.isArray(list) || list.length > 20000 || raw.code && raw.code !== 0) throw Error('礼物列表格式不正确');
  const gifts = new Map();
  for (const x of list) {
    const id = String(x.id ?? ''), name = String(x.name ?? ''), coinType = x.coin_type || x.coinType;
    const price = x.coin_type ? Number(x.price) / 1000 : Number(x.yuan);
    if (!/^\d+$/.test(id) || !name || name.length > 200 || !['gold', 'silver'].includes(coinType) || !Number.isFinite(price) || price < 0) continue;
    gifts.set(id, { id, name, yuan: coinType === 'gold' ? price : 0, coinType });
  }
  if (!gifts.size) throw Error('接口没有返回有效礼物');
  return [...gifts.values()].sort((a, b) => a.yuan - b.yuan || Number(a.id) - Number(b.id));
}
export class GiftCatalog {
  constructor(directory) { this.directory = directory; }
  room(room) { if (!/^\d{1,16}$/.test(room)) throw Error('请先填写数字直播间 ID'); return room; }
  async read(room) {
    this.room(room);
    try { return JSON.parse(await readFile(`${this.directory}/gifts-${room}.json`, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; return { roomId: room, gifts: [], updatedAt: null, source: `https://laplace.live/gift-gallery/${room}` }; }
  }
  async import(room, raw) {
    this.room(room);
    const data = { roomId: room, gifts: normalizeGifts(raw), updatedAt: Date.now(), source: `https://laplace.live/gift-gallery/${room}` };
    await mkdir(this.directory, { recursive: true });
    const file = `${this.directory}/gifts-${room}.json`; await writeFile(file + '.tmp', JSON.stringify(data)); await rename(file + '.tmp', file); return data;
  }
  async refresh(room) {
    this.room(room);
    const response = await fetch(`https://workers.vrp.moe/bilibili/room-gift-config/${room}?list=1`, { signal: AbortSignal.timeout(15000), headers: { Origin: 'https://laplace.live', Referer: 'https://laplace.live/' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw Error(`礼物接口暂不可用（HTTP ${response.status}），保留已有列表；可从礼物图鉴导入 JSON`);
    return this.import(room, await response.json());
  }
}
