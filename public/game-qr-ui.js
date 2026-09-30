export function gameQrMarkup(t){return `<div class="card setup-only" id="game-qr-setup"><h2>${t('游戏登录二维码','Game login QR')}</h2><p>${t('先在绝区零打开扫码登录界面。设置一次游戏来源和二维码区域，以后可叫号时发送到绑定QQ群。','Open the QR login screen in ZZZ. Select the game source and QR area once, then share it when calling a viewer.')}</p><div id="game-qr-config"><label>${t('OBS WebSocket 端口','OBS WebSocket port')}<input id="game-qr-port" type="number" value="4455" min="1" max="65535"></label><label>${t('OBS 密码（留空保留已保存密码）','OBS password (blank keeps the saved password)')}<input id="game-qr-password" type="password" autocomplete="off"></label><button id="game-qr-sources">${t('连接 OBS · 读取来源','Connect OBS · List sources')}</button><label>${t('选择绝区零游戏来源','Select ZZZ game source')}<select id="game-qr-source"></select></label><button id="game-qr-preview">${t('获取画面并框选二维码','Get frame & select QR area')}</button><p class="muted">${t('在下方画面中拖出一个包含完整二维码的方框，尽量不包含其他文字。游戏来源需有可见画面；黑屏时请检查 OBS 捕获设置。','Drag a box around the whole QR, avoiding other text. If the frame is black, check the OBS capture settings.')}</p><canvas id="game-qr-canvas" hidden></canvas><div class="toolbar"><button id="game-qr-save">${t('保存来源与区域','Save source & area')}</button><button id="game-qr-test">${t('测试识别（只预览，不发群）','Test detection (preview only)')}</button></div></div><p id="game-qr-status" role="status"></p><img id="game-qr-image" alt="${t('待发送的游戏登录二维码','Game login QR preview')}" hidden><p class="muted">${t('只上传识别并裁剪出的二维码；不上传整张游戏画面。群图片中会注明当前观众，请本人扫码。登录后由主播确认游戏 UID。','Only the detected QR image is uploaded. The caption identifies the current viewer. The streamer checks the in-game UID after login.')}</p></div>`;}

export function installGameQr({api,t,run,getState}){
  const $=id=>document.getElementById(id);
  let status={},crop=null,frame=null,pending=false,selection=null,loaded=false;
  const note=value=>{$('game-qr-status').textContent=value;if($('game-qr-live-status'))$('game-qr-live-status').textContent=value;};
  const connection=()=>{const value={port:Number($('game-qr-port').value)};if($('game-qr-password').value)value.password=$('game-qr-password').value;return value;};
  const show=image=>{$('game-qr-image').src=image;$('game-qr-image').hidden=false;};
  const draw=()=>{const canvas=$('game-qr-canvas'),ctx=canvas.getContext('2d');if(!frame)return;ctx.drawImage(frame,0,0);const box=selection||crop;if(box){ctx.strokeStyle='#e7ff36';ctx.lineWidth=Math.max(3,canvas.width/250);ctx.strokeRect(box.x*canvas.width,box.y*canvas.height,box.width*canvas.width,box.height*canvas.height);}};
  const update=()=>{
    const state=getState();if(!state)return;
    $('game-qr-config').hidden=!state.access?.local;
    $('game-qr-call').disabled=pending||!status.configured||state.settings.qqMode!=='public'||!state.settings.qqGroupOpenId||!state.queue.some(x=>!x.pendingRedPacket);
    $('game-qr-resend').disabled=pending||!status.configured||state.settings.qqMode!=='public'||!state.settings.qqGroupOpenId||!state.current;
    if(!loaded){loaded=true;api('/api/game-qr/status').then(value=>{status=value;crop=value.crop;$('game-qr-port').value=value.port;if(value.sourceName){const option=new Option(value.sourceName,value.sourceName);$('game-qr-source').replaceChildren(option);}note(value.configured?t(`已配置来源：${value.sourceName}。每次发送都会重新获取画面。`,`Configured: ${value.sourceName}. A fresh frame is captured for every send.`):t('尚未设置游戏来源和二维码区域。','Game source and QR area are not configured.'));update();}).catch(error=>note(error.message));}
  };
  const work=fn=>run(async()=>{if(pending)return;pending=true;update();try{await fn();}finally{pending=false;update();}});
  $('game-qr-sources').onclick=()=>work(async()=>{note(t('正在连接 OBS…','Connecting to OBS…'));const result=await api('/api/game-qr/sources',connection());const current=$('game-qr-source').value;const options=result.sources.map(source=>new Option(source.inputName,source.inputName));$('game-qr-source').replaceChildren(...options);if(options.some(x=>x.value===current))$('game-qr-source').value=current;note(t('已读取来源。选择游戏来源并获取画面。','Sources loaded. Select the game source and get a frame.'));});
  $('game-qr-preview').onclick=()=>work(async()=>{note(t('正在获取游戏画面…','Getting game frame…'));const result=await api('/api/game-qr/preview',{...connection(),sourceName:$('game-qr-source').value});frame=new Image();frame.src=result.image;await frame.decode();const canvas=$('game-qr-canvas');canvas.width=frame.naturalWidth;canvas.height=frame.naturalHeight;canvas.hidden=false;selection=null;if($('game-qr-source').value!==status.sourceName)crop=null;draw();note(t('请拖动框选完整二维码，然后保存。','Drag around the whole QR, then save.'));});
  $('game-qr-source').onchange=()=>{crop=null;frame=null;selection=null;$('game-qr-canvas').hidden=true;note(t('来源已更换，请获取新画面并重新框选。','Source changed. Get a new frame and select the QR area.'));};
  const canvas=$('game-qr-canvas');let start;
  const point=e=>{const bounds=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-bounds.left)/bounds.width)),y:Math.max(0,Math.min(1,(e.clientY-bounds.top)/bounds.height))};};
  canvas.onpointerdown=e=>{if(!frame)return;e.preventDefault();start=point(e);canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!start)return;const end=point(e);selection={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y)};draw();};
  canvas.onpointerup=e=>{if(!start)return;const end=point(e);crop={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y)};selection=null;start=null;draw();};
  canvas.onpointercancel=()=>{start=null;selection=null;draw();};
  $('game-qr-save').onclick=()=>work(async()=>{status=await api('/api/game-qr/config',{...connection(),sourceName:$('game-qr-source').value,crop});$('game-qr-password').value='';note(t('设置已保存在本机 data 中。请测试识别。','Saved in local data. Test detection next.'));});
  $('game-qr-test').onclick=()=>work(async()=>{note(t('正在识别新的游戏二维码…','Detecting the latest game QR…'));const result=await api('/api/game-qr/test',{});show(result.image);note(t('二维码识别成功。此次没有发送到群。','QR detected. Nothing was sent to the group.'));});
  const send=intent=>work(async()=>{
    note(t('正在获取新的游戏登录二维码…','Getting a fresh game login QR…'));
    const capture=await api('/api/game-qr/capture',{intent});
    show(capture.image);
    note(t(`正在发送给 ${capture.targetName}…`,`Sending for ${capture.targetName}…`));
    const result=await api('/api/game-qr/send',{intent,token:capture.token});
    if(!result.sent){const message=(result.called?t('已叫号，但群登录码发送失败。请使用“重发当前登录码”，不要再次点击继续：','Viewer called, but QR delivery failed. Use “Resend current login QR”, not call next again: '):t('登录码发送失败：','QR delivery failed: '))+result.error;note(message);throw Error(message);}
    note(t(`已向绑定群发送 ${capture.targetName} 的游戏登录二维码。`,`Sent the game login QR for ${capture.targetName} to the bound group.`));
  });
  $('game-qr-call').onclick=()=>send('advance');$('game-qr-resend').onclick=()=>send('current');
  return update;
}
