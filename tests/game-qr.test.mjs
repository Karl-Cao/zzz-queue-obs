import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {GameQr,extractLoginQr,validateLoginUrl} from '../server/game-qr.mjs';
import {readPng} from '../server/qr-image.mjs';
const require=createRequire(import.meta.url),{PNG}=require('../server/third-party/pngjs/lib/png.js'),jsQR=require('../server/third-party/jsqr.cjs');
const source='data:image/png;base64,'+(await readFile(new URL('fixtures/game-login-qr.png',import.meta.url))).toString('base64');
const crop={x:.5,y:.2,width:.4,height:.65};

test('extracts only a readable login QR with a quiet border from the game frame',()=>{
  const result=extractLoginQr(source,crop),raw=readPng(result),image=PNG.sync.read(raw.buffer);
  assert.ok(image.width<400&&image.height<400);
  const decoded=jsQR(new Uint8ClampedArray(image.data),image.width,image.height);
  assert.equal(new URL(decoded.data).searchParams.get('ticket'),'LOCAL_TEST_ONLY');
  assert.deepEqual([...image.data.subarray(0,4)],[255,255,255,255]);
  assert.throws(()=>extractLoginQr(source,{x:0,y:0,width:.3,height:.3}),/未识别/);
  assert.throws(()=>extractLoginQr(source,{...crop,x:2}),/框选/);
  assert.throws(()=>readPng('data:image/png;base64,abcd'),/PNG/);
});

test('rejects unrelated and deceptive QR URLs',()=>{
  for(const url of ['https://mihoyo.com.evil.example/login','http://user.mihoyo.com/login','https://user.mihoyo.com/','https://user.mihoyo.com:8443/login','https://user:pass@user.mihoyo.com/login'])assert.throws(()=>validateLoginUrl(url));
  assert.equal(validateLoginUrl('https://user.mihoyo.com/login-platform/mobile.html?ticket=test').hostname,'user.mihoyo.com');
  assert.equal(validateLoginUrl('https://user.mihoyo.com/qr_code_in_game.html?app_id=12&ticket=synthetic').pathname,'/qr_code_in_game.html');
});

test('configuration persists without exposing OBS password; fresh capture tokens bind to the queue',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'zzz-game-qr-'));let now=1000,captures=0;
  const fake=async()=>{captures++;return source;};
  try{
    const qr=await new GameQr(directory,{now:()=>now,capture:fake}).load();
    await qr.save({port:4455,password:'local-test-secret',sourceName:'Game',crop});
    assert.equal(qr.status().password,undefined);
    const reload=await new GameQr(directory,{now:()=>now,capture:fake}).load();
    assert.equal(reload.config.password,'local-test-secret');
    const state={current:{uid:'B',username:'B'},queue:[{uid:'C',username:'C'}]};
    const first=await qr.capture('advance',state);
    assert.equal(first.targetName,'C');
    assert.throws(()=>qr.consume(first.token,'advance',{...state,queue:[{uid:'A'}]}),/已变化/);
    const second=await qr.capture('advance',state);
    assert.ok(qr.consume(second.token,'advance',state).image);
    assert.throws(()=>qr.consume(second.token,'advance',state),/过期/);
    const third=await qr.capture('current',state);now+=30001;
    assert.throws(()=>qr.consume(third.token,'current',state),/过期/);
    assert.equal(captures,3);
    await assert.rejects(qr.capture('advance',{current:state.current,queue:[]}),/队列为空/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
