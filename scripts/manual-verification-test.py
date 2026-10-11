"""Temporary owner-only browser CAPTCHA test; credentials never reach browser."""
import asyncio
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import ssl
import sys
import time
from manual_verification_input import verification_body

os.chdir('/opt/gsuid-core-releases/87c06f1')
sys.path.insert(0,os.getcwd())
from gsuid_core.logger import logger
logger.debug=lambda *args,**kwargs:None
logger.trace=lambda *args,**kwargs:None
import aiohttp
from aiohttp import web
import certifi
from gsuid_core.utils.api.mys.base_request import BaseMysApi,_CHALLENGE_META
from gsuid_core.utils.api.mys.api import PLAYER_INFO,RECORD_BASE
from gsuid_core.utils.api.mys.tools import get_ds_token

TOKEN=secrets.token_urlsafe(32)
START=time.monotonic()
ORIGIN='https://qq.zenlesszonezero.fans'
SESSIONS={}
COUNTS={'gs':0}
RESULT=Path('/var/lib/zzz-public-qq/manual-verification-test-result.json')
with sqlite3.connect('file:/opt/gsuid-core/data/GsData.db?mode=ro',uri=True) as db:
    rows=db.execute('select cookie,device_id,fp from gsuser where user_id=? and uid=? and zzz_uid=?',('664236150','102823666','16270138')).fetchall()
if len(rows)!=1 or not all(rows[0]):raise RuntimeError('Owner record not verified')
COOKIE,DEVICE,FP=rows[0]

def header(game,params=None,body=None):
    version=BaseMysApi._HEADER['x-rpc-app_version']
    value={'Accept':'application/json','User-Agent':f'Mozilla/5.0 (Windows NT 10.0; Win64; x64) miHoYoBBS/{version}',
           'x-rpc-app_version':version,'x-rpc-client_type':'5',
           'x-rpc-challenge_game':'2','x-rpc-challenge_path':PLAYER_INFO.get(False)}
    query='&'.join(f'{k}={v}' for k,v in sorted((params or {}).items()))
    serialized=json.dumps(body,separators=(',',':'),ensure_ascii=False) if body is not None else ''
    timestamp=str(int(time.time()));nonce=str(100000+secrets.randbelow(100000))
    digest=hashlib.md5(f'salt=xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs&t={timestamp}&r={nonce}&b={serialized}&q={query}'.encode()).hexdigest()
    value.update({'Cookie':COOKIE,'x-rpc-device_id':DEVICE,'x-rpc-device_fp':FP,'DS':f'{timestamp},{nonce},{digest}'})
    return value

async def api(url,headers,params=None,body=None):
    context=ssl.create_default_context(cafile=certifi.where())
    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=context),timeout=aiohttp.ClientTimeout(total=25)) as client:
        method=client.post if body is not None else client.get
        arguments={'headers':headers,'params':params}
        if body is not None:
            arguments['data']=json.dumps(body,separators=(',',':'),ensure_ascii=False).encode()
            headers['Content-Type']='application/json; charset=utf-8'
        async with method(url,**arguments) as response:
            return await response.json()

@web.middleware
async def protect(request,handler):
    if not secrets.compare_digest(request.match_info.get('token',''),TOKEN) or time.monotonic()-START>900:
        raise web.HTTPNotFound()
    if request.method=='POST' and request.headers.get('Origin')!=ORIGIN:
        raise web.HTTPForbidden()
    try:response=await handler(request)
    except web.HTTPException:raise
    except Exception as error:
        response=web.json_response({'error':'请求失败：'+type(error).__name__},status=502)
    response.headers.update({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'})
    return response

async def index(request):
    return web.Response(content_type='text/html',text='''<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>本人查询验证测试</title>
<style>body{max-width:520px;margin:40px auto;padding:20px;font-family:system-ui;background:#15171b;color:#eee}button{padding:14px;margin:8px;font-size:18px}#status{white-space:pre-wrap;line-height:1.7}#captcha{margin:24px 0}</style>
<h2>竟然有神 · 原神验证测试 H1</h2><p>本轮仅测试原神，采用胡桃式验证路径与浏览器结果提交。无需登录、填写 Cookie 或安装证书。链接15分钟有效。</p><button onclick="start('gs')">验证原神 102823666</button><div id="captcha"></div><p id="status">点击按钮开始。</p>
<script src="https://static.geetest.com/static/js/gt.0.5.2.js"></script><script>
const status=document.getElementById('status');let busy=false,current=null;
async function start(game){if(busy)return;busy=true;status.textContent='正在取得验证码…';if(current){current.destroy();current=null;}document.getElementById('captcha').textContent='';
try{const r=await fetch(location.pathname+'/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({game})});const d=await r.json();if(!r.ok)throw Error(d.error||'获取失败');
initGeetest({gt:d.gt,challenge:d.challenge,protocol:'https://',new_captcha:true,product:'bind',api_server:'api.geetest.com'},obj=>{current=obj;obj.onReady(()=>{status.textContent='请手动完成弹出的验证码。';obj.verify();});obj.onError(()=>{status.textContent='验证码加载失败，请用 Safari 或 Chrome 打开。';busy=false;});obj.onClose(()=>{busy=false;});obj.onSuccess(async()=>{status.textContent='图形验证已完成，正在检查米游社是否接受…';try{const r=await fetch(location.pathname+'/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({game,...obj.getValidate()})});const d=await r.json();status.textContent=d.error||('H1 验证接口：'+d.verificationCode+' '+(d.verificationMessage||'')+'\\n实际角色查询：'+(d.queryCode===null?'未执行':d.queryCode)+(d.querySuccess?'，成功':'，尚未恢复'));}catch(e){status.textContent='网络请求失败，请重试。';}finally{busy=false;}});});
}catch(e){status.textContent=e.message;busy=false;}}
</script></html>''')

async def challenge(request):
    data=await request.json();game=data.get('game')
    if game not in COUNTS:raise web.HTTPBadRequest()
    if COUNTS[game]>=3:return web.json_response({'error':'本次测试达到次数上限'},status=429)
    existing=SESSIONS.get(game)
    if existing and time.monotonic()-existing['created']<15:return web.json_response({'error':'请稍后再试'},status=429)
    COUNTS[game]+=1
    result=await api(RECORD_BASE+'/game_record/app/card/wapi/createVerification',header(game,{'is_high':'true'}),params={'is_high':'true'})
    values=result.get('data') or {}
    if result.get('retcode')!=0 or not values.get('gt') or not values.get('challenge'):
        return web.json_response({'error':'验证码获取失败，代码：'+str(result.get('retcode'))},status=502)
    SESSIONS[game]={'challenge':values['challenge'],'created':time.monotonic(),'used':False}
    return web.json_response({'gt':values['gt'],'challenge':values['challenge'],'newCaptcha':bool(values.get('new_captcha',False))})

async def submit(request):
    data=await request.json();game=data.get('game');record=SESSIONS.get(game)
    if game not in COUNTS or not record or record['used'] or time.monotonic()-record['created']>180:
        return web.json_response({'error':'验证已过期或已使用，请重新选择游戏'},status=409)
    try:body=verification_body(record['challenge'],data)
    except ValueError:raise web.HTTPBadRequest()
    record['used']=True
    verified=await api(RECORD_BASE+'/game_record/app/card/wapi/verifyVerification',header(game,body=body),body=body)
    token=(verified.get('data') or {}).get('challenge')
    message=str(verified.get('message',''))[:120]
    message=re.sub(r'[A-Za-z0-9_=-]{24,}','[redacted]',message)
    outcome={'variant':'hutao-inspired-H1','game':game,'verificationCode':verified.get('retcode'),'verificationMessage':message,'queryCode':None,'querySuccess':False}
    if verified.get('retcode')==0 and token:
        uid,server=('102823666','cn_gf01') if game=='gs' else ('16270138','prod_gf_cn')
        params={'role_id':uid,'server':server};heads=header(game,params)
        if game=='zzz':
            heads.pop('x-rpc-client_type',None);heads.pop('DS',None)
            heads.update({'x-rpc-platform':'2','Referer':'https://act.mihoyo.com/','Origin':'https://act.mihoyo.com'})
        heads['x-rpc-challenge']=token
        url=PLAYER_INFO.get(False) if game=='gs' else RECORD_BASE+'/event/game_record_zzz/api/zzz/index'
        queried=await api(url,heads,params=params)
        outcome.update(queryCode=queried.get('retcode'),querySuccess=queried.get('retcode')==0)
    results=json.loads(RESULT.read_text()) if RESULT.exists() else {}
    results[game]=outcome
    RESULT.write_text(json.dumps(results));os.chmod(RESULT,0o600)
    return web.json_response(outcome)

app=web.Application(middlewares=[protect],client_max_size=8192)
app.router.add_get('/client/verification-test/{token}',index)
app.router.add_post('/client/verification-test/{token}/challenge',challenge)
app.router.add_post('/client/verification-test/{token}/submit',submit)
Path('/var/lib/zzz-public-qq/manual-verification-test-url.txt').write_text(ORIGIN+'/client/verification-test/'+TOKEN)
os.chmod('/var/lib/zzz-public-qq/manual-verification-test-url.txt',0o600)
web.run_app(app,host='127.0.0.1',port=8789,access_log=None,print=None)
