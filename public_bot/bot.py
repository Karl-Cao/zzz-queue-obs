"""Single public QQ bot account with queue relay and optional ZZZ queries."""

import asyncio
import hashlib
import json
import os
import re
from urllib.request import Request as UrlRequest, urlopen
from urllib.error import HTTPError

import nonebot
from fastapi import HTTPException, Request
from nonebot import on_type
from nonebot.adapters.qq import Adapter, Bot
from nonebot.adapters.qq.event import C2CMessageCreateEvent, GroupAtMessageCreateEvent
from nonebot.adapters.qq.message import MessageSegment
from nonebot.log import logger
from nonebot.rule import Rule
from commands import normalize_command, is_zzz_command, unsupported_zzz_command

nonebot.init(command_start={"/"})
nonebot.get_driver().register_adapter(Adapter)
if os.environ.get("PUBLIC_QQ_ENABLE_ZZZ") == "1":
    nonebot.load_plugin("GenshinUID")
    import GenshinUID

    async def zzz_group_command(event: GroupAtMessageCreateEvent) -> bool:
        return isinstance(event, GroupAtMessageCreateEvent) and is_zzz_command(event.get_plaintext()) and not unsupported_zzz_command(event.get_plaintext())

    # Shared service never forwards private chats or non-ZZZ group messages to gsuid-core.
    GenshinUID.get_message.rule &= Rule(zzz_group_command)

RELAY_URL = os.environ.get("PUBLIC_QQ_LOCAL_RELAY", "http://127.0.0.1:8787").rstrip("/")
BOT_TOKEN = os.environ["PUBLIC_QQ_BOT_TOKEN"]


@nonebot.get_app().post("/internal/queue-call")
async def send_queue_call(request: Request) -> dict:
    if request.client is None or request.client.host not in {"127.0.0.1", "::1"}:
        raise HTTPException(status_code=403)
    if request.headers.get("authorization") != f"Bearer {BOT_TOKEN}":
        raise HTTPException(status_code=403)
    data = await request.json()
    group_openid = str(data.get("groupOpenId", ""))
    member_openid = str(data.get("memberOpenId", ""))
    name = str(data.get("name", "")).strip()
    text = data.get("text", f"轮到 {name} 了，请做好准备。")
    if not isinstance(text, str) or not text.strip() or len(text) > 500:
        raise HTTPException(status_code=400)
    if not group_openid or len(group_openid) > 128 or (member_openid and not re.fullmatch(r"[A-Za-z0-9_-]{5,128}", member_openid)) or not name or len(name) > 80:
        raise HTTPException(status_code=400)
    try:
        qq_bot = nonebot.get_bot(os.environ["PUBLIC_QQ_APP_ID"])
        if member_openid:
            safe_text = re.sub(r"([\\`*_{}\[\]()#+.!|<>])", r"\\\1", text)
            message = MessageSegment.markdown(
                f'<qqbot-at-user id="{member_openid}" /> {safe_text}'
            )
        else:
            message = MessageSegment.text(text)
        await qq_bot.send_to_group(group_openid=group_openid, message=message)
    except Exception as error:
        logger.exception("QQ群叫号发送失败")
        if "40034105" in str(error):
            raise HTTPException(status_code=403, detail="QQ群未允许机器人主动发言；请群主在群机器人设置中开启")
        raise HTTPException(status_code=502, detail="QQ API rejected queue call")
    return {"ok": True}


def post(path: str, payload: dict) -> dict:
    request = UrlRequest(
        RELAY_URL + path,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {BOT_TOKEN}"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=12) as response:
            return json.load(response)
    except HTTPError as error:
        try:
            return {"reply": json.load(error).get("error", "请求失败")}
        except (ValueError, UnicodeDecodeError):
            return {"reply": "请求失败，请稍后重试。"}


direct = on_type(C2CMessageCreateEvent, priority=5, block=True)
group = on_type(GroupAtMessageCreateEvent, priority=5, block=True)


@direct.handle()
async def bind_direct(bot: Bot, event: C2CMessageCreateEvent) -> None:
    if not event.get_plaintext().strip().startswith("/"):
        return
    try:
        result = await asyncio.to_thread(post, "/bot/dm", {
            "openid": str(event.author.user_openid), "text": event.get_plaintext().strip(),
        })
        await bot.send(event, result["reply"])
    except Exception:
        await bot.send(event, "绑定服务暂不可用，请稍后再试。")


@group.handle()
async def handle_group(bot: Bot, event: GroupAtMessageCreateEvent) -> None:
    raw = event.get_plaintext().strip()
    if not raw.startswith("/"):
        return
    content = normalize_command(raw)
    if not content or len(content) > 80:
        return
    if unsupported_zzz_command(raw):
        await bot.send(event, '当前 ZZZeroUID 版本尚未实现此图鉴功能。角色攻略可使用：/zzz角色攻略 安比；完整功能请发 /zzz帮助。')
        return
    member_openid = str(event.author.member_openid)
    try:
        result = await asyncio.to_thread(post, "/bot/group", {
            "groupOpenId": str(event.group_openid),
            "groupId": str(event.group_id),
            "memberOpenId": member_openid,
            "name": (getattr(event.author, "username", None) or f"QQ用户{member_openid[:6]}").strip(),
            "messageId": hashlib.sha256(str(event.id).encode("utf-8")).hexdigest(),
            "text": raw,
        })
        if result.get("reply"):
            await bot.send(event, result["reply"])
    except Exception:
        logger.exception("公共机器人群消息转发失败")
        await bot.send(event, "排队服务暂不可用，请稍后再试。")


if __name__ == "__main__":
    nonebot.run()
