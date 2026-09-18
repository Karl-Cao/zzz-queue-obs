import test from 'node:test'; import assert from 'node:assert/strict';
import { normalizeGifts, GiftCatalog } from '../server/gifts.mjs';
import { defaults, action, event } from '../server/core.mjs';
test('图鉴金瓜子转换人民币、银瓜子不计费、按 ID 保留同名礼物', () => {
  const gifts = normalizeGifts({ code: 0, data: { list: [{ id: 1, name: '灯牌', price: 100, coin_type: 'gold' }, { id: 2, name: '灯牌', price: 100, coin_type: 'silver' }] } });
  assert.equal(gifts.length, 2); assert.equal(gifts.find(x => x.id === '1').yuan, .1); assert.equal(gifts.find(x => x.id === '2').yuan, 0);
  assert.throws(() => normalizeGifts({ data: { list: [] } }));
});
test('同名不同 ID 礼物均可参与抽奖，旧 ID 设置不影响匹配', () => {
  const s = defaults(); s.settings.roomId = '446277'; s.settings.lotteryGift = '灯牌'; s.settings.lotteryGiftId = '1'; action(s, { type: 'start' });
  for (const giftId of ['2', '1']) event(s, { type: 'gift', uid: giftId, username: giftId, giftId, giftName: '灯牌', priceNormalized: 1, roomId: '446277', id: giftId });
  assert.deepEqual(s.lottery.entries.map(x => x.uid), ['2','1']);
});
test('直播间 ID 不允许路径穿越', async () => {
  const c = new GiftCatalog('data'); await assert.rejects(c.read('../state')); await assert.rejects(c.import('../state', {}));
});
