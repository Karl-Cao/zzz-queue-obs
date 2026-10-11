"""Operator-only device import. Input arrives over SSH, never in a QQ group."""
import argparse
import asyncio
import copy
import json
import os
from pathlib import Path
import sqlite3
import sys
import time

from real_device_input import validate_device_input


async def main() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument('--input',required=True)
    parser.add_argument('--uid',required=True)
    parser.add_argument('--requester',required=True)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    device=validate_device_input(json.loads(Path(args.input).read_text(encoding='utf-8-sig')),args.uid)
    if args.check:
        print(json.dumps({'valid':True,'writes':False}));return
    os.chdir('/opt/gsuid-core-releases/87c06f1')
    sys.path.insert(0,os.getcwd())
    from gsuid_core.logger import logger
    logger.debug=lambda *args,**kwargs:None
    logger.trace=lambda *args,**kwargs:None
    import aiohttp
    from gsuid_core.utils.api.mys.base_request import BaseMysApi
    from gsuid_core.utils.api.mys.api import MIHOYO_BBS_PLAYER_INFO, PLAYER_INFO
    from gsuid_core.utils.api.mys.tools import get_ds_token
    path=Path('/opt/gsuid-core/data/GsData.db')
    with sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True) as connection:
        rows=connection.execute('select id,user_id,mys_id,cookie from gsuser where uid=?',(args.uid,)).fetchall()
    if len(rows)!=1 or rows[0][1]!=args.requester or not rows[0][3]:
        raise ValueError('Expected one credential record owned by the selected group requester')
    record_id,_,account_id,cookie=rows[0]
    header=copy.deepcopy(BaseMysApi._HEADER)
    header.update({'Cookie':cookie,'x-rpc-device_id':device['device_id'],'x-rpc-device_fp':device['fp']})
    async def request(url: str, params: dict[str,str]) -> dict:
        request_header=dict(header)
        request_header['DS']=get_ds_token('&'.join(f'{key}={value}' for key,value in params.items()))
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=25)) as session:
            async with session.get(url,headers=request_header,params=params) as response:
                return await response.json()
    # Verify the existing authorized account still owns this game UID before writing.
    roles=await request(MIHOYO_BBS_PLAYER_INFO.get(False),{'uid':str(account_id)})
    if roles.get('retcode')!=0 or not any(str(role.get('game_id'))=='2' and str(role.get('game_role_id'))==args.uid for role in roles.get('data',{}).get('list',[])):
        raise ValueError('Could not verify the existing account owns this Genshin UID; nothing changed')
    directory=Path('/var/backups/zzz-public-qq/real-device-'+str(time.time_ns()))
    directory.mkdir(mode=0o700)
    with sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True) as source,sqlite3.connect(directory/'GsData.db') as backup:
        source.backup(backup)
    os.chmod(directory/'GsData.db',0o600)
    with sqlite3.connect(path,timeout=10) as connection:
        if 'device_info' in device:
            cursor=connection.execute('update gsuser set fp=?,device_id=?,device_info=? where id=? and uid=? and user_id=? and cookie=?',(device['fp'],device['device_id'],device['device_info'],record_id,args.uid,args.requester,cookie))
        else:
            cursor=connection.execute('update gsuser set fp=?,device_id=? where id=? and uid=? and user_id=? and cookie=?',(device['fp'],device['device_id'],record_id,args.uid,args.requester,cookie))
        if cursor.rowcount!=1:raise ValueError('Credential record changed concurrently; import cancelled')
    # Probe the real API without cache and without sending a QQ message.
    try:
        result=await request(PLAYER_INFO.get(False),{'role_id':args.uid,'server':'cn_gf01'})
        print(json.dumps({'imported':True,'querySuccess':result.get('retcode')==0,'queryErrorCode':result.get('retcode'),'backupCreated':True}))
    except Exception as error:
        print(json.dumps({'imported':True,'querySuccess':False,'probeErrorType':type(error).__name__,'backupCreated':True}))
        sys.exit(2)


if __name__=='__main__':
    try:asyncio.run(main())
    except ValueError as error:print(json.dumps({'imported':False,'reason':str(error)}));sys.exit(1)
    except Exception as error:print(json.dumps({'operationIncomplete':True,'errorType':type(error).__name__}));sys.exit(1)
