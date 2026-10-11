"""Loopback credential handoff and requester-owned LOL query context."""
from __future__ import annotations

import os
import secrets
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from functools import wraps
from http.cookies import SimpleCookie

from fastapi import HTTPException, Request
from gsuid_core.bot import Bot
from gsuid_core.models import Event
from gsuid_core.server import on_core_start_before
from gsuid_core.sv import SL, Plugins
from gsuid_core.webconsole.app_app import app
from pydantic import BaseModel, Field, SecretStr

from .binding import search_and_bind
from .summoner_name import normalize_binding_argument, normalize_lol_uid, normalize_summoner_name

Plugins(name='public_lol_bridge', allow_empty_prefix=False)
current_member: ContextVar[str | None] = ContextVar('public_lol_member', default=None)
scoped_handlers = 0


class CredentialInput(BaseModel):
    member: str = Field(min_length=5, max_length=128, pattern=r'^[A-Za-z0-9_-]+$')
    cookie: SecretStr


def require_bot(request: Request) -> None:
    token = os.environ.get('PUBLIC_QQ_BOT_TOKEN', '')
    if request.client is None or request.client.host not in {'127.0.0.1', '::1'} or not token:
        raise HTTPException(status_code=403)
    if not secrets.compare_digest(request.headers.get('authorization', ''), 'Bearer ' + token):
        raise HTTPException(status_code=401)


@app.get('/api/public_lol_bridge/status')
async def bridge_status(request: Request) -> dict[str, int]:
    require_bot(request)
    return {'scoped_handlers': scoped_handlers}


def scope_handler(handler: Callable[[Bot, Event], Awaitable[object]]) -> Callable[[Bot, Event], Awaitable[object]]:
    @wraps(handler)
    async def scoped(bot: Bot, event: Event) -> object:
        bind_name = event.command == '绑定' and normalize_summoner_name(event.text) is not None
        if event.command == '搜索':
            name = normalize_summoner_name(event.text)
            if name is None:
                return await bot.send(
                    '请填写完整的召唤师名称和编号，例如：/lol搜索 玩家昵称#12345。'
                    '请从游戏内复制，# 后的数字不要省略。'
                )
            event.text = name
        if not bind_name and event.command in {'绑定', '绑定uid', '绑定UID', '切换', '切换uid', '切换UID', '删除uid', '删除UID'}:
            if event.text.strip():
                uid = normalize_binding_argument(event.command, event.text)
                if uid is None:
                    return await bot.send(
                        '请发送 /lol绑定 玩家昵称#12345，昵称和数字编号都要填写。'
                        '手动绑定已有 UID 可用 /lol绑定UID abcdef==:1。'
                    )
                event.text = uid
        token = current_member.set(event.user_id if event.bot_id == 'qqgroup' else None)
        try:
            if bind_name or (event.command == '绑定' and not event.text.strip()):
                return await search_and_bind_lol(bot, event)
            return await handler(bot, event)
        finally:
            current_member.reset(token)
    return scoped


@app.post('/api/public_lol_bridge/credentials')
async def store_credentials(request: Request, payload: CredentialInput) -> dict[str, bool]:
    require_bot(request)
    from plugins.LOLegendsUID.LOLegendsUID.utils.database.models import (
        LOLUser,
    )

    cookie = payload.cookie.get_secret_value()
    if len(cookie) > 8192 or '\r' in cookie or '\n' in cookie:
        raise HTTPException(status_code=400)
    parsed: SimpleCookie = SimpleCookie()
    parsed.load(cookie)
    if not all(key in parsed and parsed[key].value for key in ('tgp_ticket', 'tgp_id', 'skey')):
        raise HTTPException(status_code=400)
    if await LOLUser.select_data(payload.member, 'qqgroup') is None:
        await LOLUser.insert_data(payload.member, 'qqgroup', cookie=cookie, status=False)
    else:
        await LOLUser.update_data(payload.member, 'qqgroup', cookie=cookie, status=False)
    return {'saved': True}


async def unlink_lol(bot: Bot, event: Event) -> object:
    from plugins.LOLegendsUID.LOLegendsUID.utils.database.models import LOLBind

    if event.text.strip():
        uid = normalize_lol_uid(event.text)
        if uid is None:
            return await bot.send('UID 格式不正确。直接发送 /lol解除绑定 可解除当前账号；指定账号请填写完整 UID。')
    else:
        uid = await LOLBind.get_uid_by_game(event.user_id, event.bot_id)
    if not uid:
        return await bot.send('你还没有绑定 LOL 账号。')
    result = await LOLBind.delete_uid(event.user_id, event.bot_id, uid)
    if result != 0:
        return await bot.send('该 LOL UID 不在你的绑定列表中。')
    return await bot.send(f'已解除 LOL 账号绑定：{uid}。')


async def search_and_bind_lol(bot: Bot, event: Event) -> object:
    from plugins.LOLegendsUID.LOLegendsUID.lol_user.search_player import search_player_with_name
    from plugins.LOLegendsUID.LOLegendsUID.utils.database.models import LOLBind
    from plugins.LOLegendsUID.LOLegendsUID.utils.error_reply import get_error

    return await search_and_bind(bot, event, search_player_with_name, LOLBind, get_error)


@on_core_start_before
async def install_owned_queries() -> None:
    global scoped_handlers
    from plugins.LOLegendsUID.LOLegendsUID.lol_user import lol_user_bind
    from plugins.LOLegendsUID.LOLegendsUID.utils.database.models import (
        LOLUser,
    )
    from plugins.LOLegendsUID.LOLegendsUID.utils.error_reply import error_dict
    from plugins.LOLegendsUID.LOLegendsUID import lol_info

    error_dict[8000014] = '腾讯查询失败（8000014）。请核对完整 UID 和区服；此错误不能证明召唤师搜索已关闭。'
    error_dict[-51] = '你还没有绑定 LOL 账号，请发送 /lol绑定 玩家昵称#12345。'
    lol_info.UID_HINT = error_dict[-51]
    error_dict[-511] = '请先发送 /lol扫码登录 你的QQ号，完成本人 WeGame 查询授权。'
    lol_user_bind.on_command('解除绑定', block=True)(unlink_lol)

    async def get_owned_cookie(cls: type[LOLUser], uid: str) -> str | None:
        member = current_member.get()
        if member is None:
            return None
        return await cls.get_user_cookie_by_user_id(member, 'qqgroup')

    LOLUser.get_random_cookie = classmethod(get_owned_cookie)
    for sv in SL.lst.values():
        if sv.self_plugin_name != 'LOLegendsUID':
            continue
        for triggers in sv.TL.values():
            for trigger in triggers.values():
                if trigger.func.__name__ == 'send_lol_search_msg':
                    trigger.func = search_and_bind_lol
                trigger.func = scope_handler(trigger.func)
                scoped_handlers += 1
