import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLaplaceEvent} from '../server/laplace.mjs';
import {defaults,event} from '../server/core.mjs';
const gift=(extra={})=>({type:'gift',uid:'u',username:'银橙桑不爱吃糖',origin:'1',id:'blind-1',giftName:'福灵小兽',giftAmount:2,coinType:'gold',priceNormalized:10,blindGift:{gift_tip_price:20000,original_gift_price:5000},...extra});
test('blind rewards use unit reward value times quantity, not purchase price',()=>{
 assert.equal(normalizeLaplaceEvent(gift()).price,40);
 const s=defaults();s.settings.roomId='1';s.settings.giftMinimum=20;event(s,gift());assert.equal(s.queue[0].cents,4000);event(s,gift());assert.equal(s.queue[0].cents,4000);
});
test('small reward cannot qualify using a larger box purchase price',()=>{
 const s=defaults();s.settings.roomId='1';event(s,gift({giftAmount:1,blindGift:{gift_tip_price:10,original_gift_price:5000}}));assert.equal(s.queue.length,0);
});
test('missing reward value falls back to purchase price',()=>{
 for(const tip of [undefined,null,'',-1,'invalid']){const e=normalizeLaplaceEvent(gift({blindGift:{gift_tip_price:tip,original_gift_price:5000}}));assert.equal(e.price,10);assert.equal(e.valuationMissing,false);assert.equal(e.valuationSource,'purchase');}
 assert.equal(normalizeLaplaceEvent(gift({coinType:'silver'})).price,0);
 assert.equal(normalizeLaplaceEvent(gift({blindGift:null})).price,10);
});

test('each opening uses its own value even for the same gift name',()=>{
 const s=defaults();s.settings.roomId='1';
 event(s,gift({id:'first',giftAmount:1,blindGift:{gift_tip_price:2000}}));
 event(s,gift({id:'second',giftAmount:1,blindGift:{gift_tip_price:8000}}));
 assert.equal(s.queue[0].cents,1000);
});
test('fallback respects total paid, unit purchase price and zero reward',()=>{
 assert.equal(normalizeLaplaceEvent(gift({priceNormalized:8,blindGift:{original_gift_price:5000}})).price,8);
 assert.equal(normalizeLaplaceEvent(gift({priceNormalized:undefined,blindGift:{original_gift_price:5000}})).price,10);
 assert.equal(normalizeLaplaceEvent(gift({blindGift:{gift_tip_price:0,original_gift_price:5000}})).price,0);
 const missing=normalizeLaplaceEvent(gift({priceNormalized:undefined,blindGift:{}}));assert.equal(missing.price,0);assert.equal(missing.valuationMissing,true);
});
