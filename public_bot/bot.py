"""Single public QQ bot account with queue relay and optional ZZZ queries."""

import asyncio
import base64
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
from commands import normalize_command, is_zzz_command, is_group_qr_login_command, unsupported_zzz_command

nonebot.init(command_start={"/"})
nonebot.get_driver().register_adapter(Adapter)
if os.environ.get("PUBLIC_QQ_ENABLE_ZZZ") == "1":
    nonebot.load_plugin("GenshinUID")
    import GenshinUID

    async def zzz_group_command(event: GroupAtMessageCreateEvent) -> bool:
        return isinstance(event, GroupAtMessageCreateEvent) and (
            is_group_qr_login_command(event.get_plaintext()) or
            (is_zzz_command(event.get_plaintext()) and not unsupported_zzz_command(event.get_plaintext()))
        )

    # Shared service never forwards private chats or non-ZZZ group messages to gsuid-core.
    GenshinUID.get_message.rule &= Rule(zzz_group_command)

RELAY_URL = os.environ.get("PUBLIC_QQ_LOCAL_RELAY", "http://127.0.0.1:8787").rstrip("/")
BOT_TOKEN = os.environ["PUBLIC_QQ_BOT_TOKEN"]


@nonebot.get_app().post("/internal/game-qr")
async def send_game_qr(request: Request) -> dict:
    if request.client is None or request.client.host not in {"127.0.0.1", "::1"} or request.headers.get("authorization") != f"Bearer {BOT_TOKEN}":
        raise HTTPException(status_code=403)
    raw = await request.body()
    if len(raw) > 360000:
        raise HTTPException(status_code=413)
    data = json.loads(raw)
    group = str(data.get("groupOpenId", ""))
    member = str(data.get("memberOpenId", ""))
    name = str(data.get("name", "")).strip()
    image = data.get("image", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{5,128}", group) or not name or len(name) > 80 or (member and not re.fullmatch(r"[A-Za-z0-9_-]{5,128}", member)):
        raise HTTPException(status_code=400)
    try:
        if not isinstance(image, str) or not image.startswith("data:image/png;base64,"):
            raise ValueError()
        png = base64.b64decode(image[22:], validate=True)
        width = int.from_bytes(png[16:20], "big")
        height = int.from_bytes(png[20:24], "big")
        if not 33 <= len(png) <= 256 * 1024 or png[:8] != b"\x89PNG\r\n\x1a\n" or png[12:16] != b"IHDR" or not (80 <= width <= 1600 and 80 <= height <= 1600):
            raise ValueError()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="登录码图片格式无效")
    try:
        qq_bot = nonebot.get_bot(os.environ["PUBLIC_QQ_APP_ID"])
        if data.get("notify") and member:
            await qq_bot.send_to_group(group_openid=group, message=MessageSegment.markdown(
                f'<qqbot-at-user id="{member}" /> 主播已重新发送你的游戏登录二维码，请本人扫码。'
            ))
        # Keep the real @ in a separate markdown message; image mentions render literally.
        caption = f"【游戏登录码 · {name}】请本人使用米游社扫码，登录主播电脑上的绝区零。若已过期，请让主播刷新并重发。"
        await qq_bot.send_to_group(group_openid=group, message=MessageSegment.text(caption) + MessageSegment.file_image(png))
    except Exception as error:
        # Never log a QR image or full outgoing API payload.
        logger.warning(f"游戏登录码发送失败：{type(error).__name__}")
        if "40034105" in str(error):
            raise HTTPException(status_code=403, detail="QQ群未允许机器人主动发言，请群主开启后重试")
        raise HTTPException(status_code=502, detail="QQ 拒绝发送登录码图片，请检查主动图片权限后重发")
    return {"ok": True}


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
        await bot.send(event,"欢迎使用然神机器人。私聊发送 /帮助，查看主播群绑定、解绑及其他口令。")
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
    if is_group_qr_login_command(raw):
        # Send an independent proactive markdown mention. A normal reply would
        # reuse the incoming msgseq and QQ would deduplicate the core's QR image.
        member_openid = str(event.author.member_openid)
        try:
            await bot.send_to_group(
                group_openid=str(event.group_openid),
                message=MessageSegment.markdown(
                    f'<qqbot-at-user id="{member_openid}" /> 请本人扫码登录；二维码会显示在群内，请勿代扫。'
                ),
            )
        except Exception:
            logger.exception("群扫码登录提及发送失败")
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
