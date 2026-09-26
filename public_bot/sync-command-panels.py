"""Explicit operator action: sync owned QQ group command panels, keeping others intact."""
import json
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import sys

ROOT = Path(__file__).resolve().parent.parent
PANELS = {
    'ZZZQueue:排队与绑定': [
        ('排队','加入主播队列'), ('绑定B站','后加B站UID，再发弹幕验证'),
        ('查看绑定','查看本群绑定昵称'), ('解绑B站','解除本群昵称绑定'),
        ('红包排队','后加金额，需主播核对入账'),
        ('绑定群','主播专用：后加绑定码'),
    ],
    'ZZZQueue:绝区零查询': [
        ('zzz帮助','查看完整指令'), ('zzz绑定UID','后加绝区零游戏UID'),
        ('zzz查询','查询账号信息，需要CK'), ('zzz刷新面板','刷新公开展示角色'),
        ('zzz练度统计','查看角色练度统计'), ('zzz角色面板','后加角色名'),
        ('zzz深渊','查询危局强袭'), ('zzz兑换码','查询兑换码'),
        ('zzz签到','米游社签到，需要CK'), ('zzz抽卡记录','查看抽卡记录'),
    ],
    'ZZZQueue:绝区零图鉴': [
        ('zzz角色攻略','后加角色名'),
    ],
}

# Keep all commands in one panel so a client's selected panel includes everything.
LEGACY_REMARKS = set(PANELS)
PANELS = {'ZZZQueue:全部指令': [entry for entries in PANELS.values() for entry in entries]}

def equivalent_item(actual, expected):
    # QQ accepts slash-prefixed commands but returns their canonical bare names.
    return all((str(actual.get(k,'')).removeprefix('/')==str(value).removeprefix('/') if k=='name'
                else actual.get(k,False if k=='only_admin' else None)==value)
               for k,value in expected.items())

def request(method, url, data=None, token=None):
    headers = {'Content-Type':'application/json'}
    if token: headers['Authorization'] = 'QQBot ' + token
    req = Request(url, data=None if data is None else json.dumps(data,ensure_ascii=False).encode(), headers=headers, method=method)
    try:
        with urlopen(req,timeout=20) as response: return json.load(response)
    except HTTPError as error:
        # Never print the request, credential document or access token.
        body=json.loads(error.read().decode())
        failure=RuntimeError(f'QQ API HTTP {error.code}: code={body.get("code")} message={body.get("message", "request rejected")}')
        failure.api_code=body.get('code')
        raise failure from None

def main():
    for entries in PANELS.values():
        assert len(entries)<=20
        for name,desc in entries:
            assert sum(1 if ord(c)<128 else 2 for c in '/'+name)<=14
            assert sum(1 if ord(c)<128 else 2 for c in desc)<=30
    if '--validate' in sys.argv:
        print('Command panels validated'); return
    credentials=json.loads((ROOT/'data/qq-runtime/official-bot.json').read_text(encoding='utf-8-sig'))
    token=request('POST','https://bots.qq.com/app/getAppAccessToken',{'appId':credentials['appId'],'clientSecret':credentials['secret']})['access_token']
    base='https://api.bot.qq.com'
    records=[]; cursor=''
    while True:
        from urllib.parse import urlencode
        page=request('GET',base+'/v2/panels?'+urlencode({'scope':'group','limit':50,'cursor':cursor}),token=token)
        records.extend(page.get('records',[]))
        cursor=page.get('next_cursor','')
        if page.get('is_end') or not cursor: break
    backup=ROOT/'data/public-qq-host/command-panels-backup.json'
    backup.parent.mkdir(parents=True,exist_ok=True)
    backup.write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
    for remark,entries in PANELS.items():
        panel={'remark':remark,'items':[{'type':'command','name':'/'+name,'desc':desc,'only_admin':name=='绑定群'} for name,desc in entries]}
        matches=[r for r in records if r.get('panel',{}).get('remark')==remark]
        if len(matches)>1: raise RuntimeError('Duplicate owned panel: '+remark)
        if matches:
            panel_id=matches[0]['panel_id']
            try: request('PUT',base+'/v2/panels/'+panel_id,{'panel':panel},token)
            except RuntimeError as error:
                if getattr(error,'api_code',None)!=30006: raise
                panel_id=request('POST',base+'/v2/panels',{'scope':'group','target_type':'all','panel':panel},token)['panel_id']
        else:
            panel_id=request('POST',base+'/v2/panels',{'scope':'group','target_type':'all','panel':panel},token)['panel_id']
        detail=request('GET',base+'/v2/panels/'+panel_id,token=token)
        actual=detail['panel']['items']
        expected=panel['items']
        assert len(actual)==len(expected) and all(equivalent_item(item,target) for item,target in zip(actual,expected)), 'Panel verification mismatch'
        print(remark+': synced and verified ('+str(len(entries))+' commands)')
    # Retire only our previous split panels, after the combined panel is verified.
    for record in records:
        if record.get('panel',{}).get('remark') in LEGACY_REMARKS:
            try:
                request('DELETE',base+'/v2/panels/'+record['panel_id'],token=token)
            except RuntimeError as error:
                if getattr(error,'api_code',None)!=30006: raise
            print('Retired legacy split panel: '+record['panel']['remark'])

if __name__=='__main__': main()
