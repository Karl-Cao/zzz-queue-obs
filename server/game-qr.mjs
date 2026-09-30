import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { screenshotObsSource, listObsInputs } from './obs.mjs';
import { readPng } from './qr-image.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('./third-party/pngjs/lib/png.js');
const jsQR = require('./third-party/jsqr.cjs');

export function validateLoginUrl(text) {
  let url; try { url=new URL(text); } catch { throw Error('检测到的二维码不是米哈游登录码'); }
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||!['mihoyo.com','hoyoverse.com'].some(domain=>host===domain||host.endsWith('.'+domain))||!/(?:login|qrcode|qr_code_in_game\.html$)/i.test(url.pathname)) throw Error('检测到的二维码不是米哈游登录码，请框选游戏登录二维码');
  return url;
}

export function validCrop(crop) {
  if (!crop || !['x','y','width','height'].every(k=>Number.isFinite(crop[k])) || crop.x<0 || crop.y<0 || crop.width<=0 || crop.height<=0 || crop.x+crop.width>1.001 || crop.y+crop.height>1.001) throw Error('请在画面中框选完整二维码区域');
  return Object.fromEntries(['x','y','width','height'].map(k=>[k,crop[k]]));
}

export function extractLoginQr(imageData, crop) {
  const raw=readPng(imageData), image=PNG.sync.read(raw.buffer);
  crop=validCrop(crop);
  const x=Math.floor(crop.x*image.width),y=Math.floor(crop.y*image.height);
  const width=Math.min(image.width-x,Math.ceil(crop.width*image.width)),height=Math.min(image.height-y,Math.ceil(crop.height*image.height));
  if(width<80||height<80||width*height>2_500_000)throw Error('二维码区域太小或太大，请重新框选');
  const region=new PNG({width,height});
  PNG.bitblt(image,region,x,y,width,height,0,0);
  const code=jsQR(new Uint8ClampedArray(region.data),width,height,{inversionAttempts:'attemptBoth'});
  if(!code)throw Error('未识别到二维码。请打开游戏扫码登录界面，刷新二维码后重试；也请检查 OBS 是否黑屏');
  validateLoginUrl(code.data);
  const corners=['topLeftCorner','topRightCorner','bottomLeftCorner','bottomRightCorner'].map(k=>code.location[k]);
  const left=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.x))));
  const top=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.y))));
  const right=Math.min(width,Math.ceil(Math.max(...corners.map(p=>p.x))));
  const bottom=Math.min(height,Math.ceil(Math.max(...corners.map(p=>p.y))));
  const qrWidth=right-left,qrHeight=bottom-top;
  if(qrWidth<80||qrHeight<80)throw Error('二维码像素不足，请放大游戏窗口后重新获取');
  const margin=Math.max(12,Math.ceil(Math.max(qrWidth,qrHeight)*4/(17+4*code.version)));
  const result=new PNG({width:qrWidth+margin*2,height:qrHeight+margin*2});result.data.fill(255);
  PNG.bitblt(region,result,left,top,qrWidth,qrHeight,margin,margin);
  const output=PNG.sync.write(result);
  if(output.length>256*1024)throw Error('二维码图片过大，请缩小框选区域');
  // Ensure the isolated image still decodes before sending it outside the PC.
  const check=jsQR(new Uint8ClampedArray(result.data),result.width,result.height);
  if(!check||check.data!==code.data)throw Error('二维码裁剪后不可识别，请重新框选');
  return 'data:image/png;base64,'+output.toString('base64');
}

export class GameQr {
  constructor(directory,{now=()=>Date.now(),capture=screenshotObsSource,inputs=listObsInputs}={}) {
    this.path=join(directory,'game-qr.json');this.now=now;this.captureSource=capture;this.listInputs=inputs;this.config=null;this.tokens=new Map();
  }
  async load(){try{this.config=JSON.parse(await readFile(this.path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}return this;}
  status(){const c=this.config;return {configured:Boolean(c?.sourceName&&c?.crop),sourceName:c?.sourceName||'',port:c?.port||4455,crop:c?.crop||null,passwordSaved:Boolean(c?.password)};}
  connection(input={}) {
    const port=Number(input.port??this.config?.port??4455),password=input.password??this.config?.password??'';
    if(!Number.isInteger(port)||port<1||port>65535||typeof password!=='string'||password.length>1024)throw Error('OBS 端口或密码无效');
    return {port,password};
  }
  async sources(input){return this.listInputs(this.connection(input));}
  async preview(input){const sourceName=String(input.sourceName||'');if(!sourceName||sourceName.length>200)throw Error('请选择 OBS 游戏来源');return this.captureSource(this.connection(input),sourceName);}
  async save(input){
    const sourceName=String(input.sourceName||'');if(!sourceName||sourceName.length>200)throw Error('请选择 OBS 游戏来源');
    this.config={...this.connection(input),sourceName,crop:validCrop(input.crop)};
    await mkdir(dirname(this.path),{recursive:true});
    await writeFile(this.path+'.tmp',JSON.stringify(this.config),{mode:0o600});await rename(this.path+'.tmp',this.path);this.tokens.clear();return this.status();
  }
  async capture(intent,state){
    if(!this.status().configured)throw Error('请先设置游戏登录码来源和二维码区域');
    const target=intent==='advance'?state.queue[0]:state.current;
    if(!target)throw Error(intent==='advance'?'等待队列为空，无法叫号':'暂无当前观众');
    const config=this.config;
    const source=await this.captureSource(this.connection(),config.sourceName);
    if(this.config!==config)throw Error('登录码设置已变化，请重新获取');
    const image=extractLoginQr(source,config.crop),capturedAt=this.now(),token=randomUUID();
    for(const [key,value]of this.tokens)if(capturedAt-value.capturedAt>30000)this.tokens.delete(key);
    if(this.tokens.size>=16)this.tokens.delete(this.tokens.keys().next().value);
    this.tokens.set(token,{image,capturedAt,intent,targetUid:target.uid,currentUid:state.current?.uid||null});
    return {token,image,capturedAt,targetName:target.username};
  }
  consume(token,intent,state){
    const item=this.tokens.get(token);this.tokens.delete(token);
    if(!item||this.now()-item.capturedAt>30000||item.intent!==intent)throw Error('登录码预览已过期，请重新获取');
    const target=intent==='advance'?state.queue[0]:state.current;
    if(!target||target.uid!==item.targetUid||(state.current?.uid||null)!==item.currentUid)throw Error('当前观众或下一位已变化，请重新获取登录码');
    return {image:item.image,capturedAt:item.capturedAt};
  }
}
