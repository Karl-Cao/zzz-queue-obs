"""Official QQ group @message -> local queue service.

The official adapter exposes QQ OpenIDs. It never supplies a user's numeric QQ
account ID to the queue. ZZZ query commands still flow through GenshinUID.
"""

import asyncio
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from nonebot import on_type
from nonebot.adapters.qq import Bot
from nonebot.adapters.qq.event import GroupAtMessageCreateEvent


CONFIG = Path(os.environ.get("ZZZ_QUEUE_QQ_CONFIG", ""))
OBSERVED = CONFIG.parent.parent / "official-groups.json"
queue_message = on_type(GroupAtMessageCreateEvent, priority=5, block=False)


def _remember_group(event: GroupAtMessageCreateEvent) -> None:
    openid = str(event.group_openid)
    if not openid:
        return
    try:
        groups = json.loads(OBSERVED.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        groups = []
    groups = [group for group in groups if group.get("openid") != openid]
    groups.insert(0, {"openid": openid, "groupId": str(event.group_id), "seenAt": datetime.now(timezone.utc).isoformat()})
    OBSERVED.parent.mkdir(parents=True, exist_ok=True)
    temporary = OBSERVED.with_suffix(".tmp")
    temporary.write_text(json.dumps(groups[:10], ensure_ascii=False), encoding="utf-8")
    temporary.replace(OBSERVED)


def _post(url: str, token: str, payload: dict) -> dict:
    request = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Queue-QQ-Token": token},
        method="POST",
    )
    with urlopen(request, timeout=5) as response:
        return json.load(response)


@queue_message.handle()
async def join_queue(bot: Bot, event: GroupAtMessageCreateEvent) -> None:
    if event.get_plaintext().strip() != "排队" or not CONFIG.is_file():
        return
    _remember_group(event)
    settings = json.loads(CONFIG.read_text(encoding="utf-8"))
    if not settings.get("group_openid") or str(event.group_openid) != str(settings["group_openid"]):
        return
    member_openid = str(event.author.member_openid)
    name = (getattr(event.author, "username", None) or "").strip()
    if not name:
        name = f"QQ用户{member_openid[:6]}"
    payload = {
        "groupId": str(settings["group_id"]),
        "userId": member_openid,
        "messageId": hashlib.sha256(str(event.id).encode("utf-8")).hexdigest(),
        "name": name,
        "message": "排队",
    }
    try:
        result = await asyncio.to_thread(
            _post,
            str(settings.get("queue_url", "http://127.0.0.1:3667/api/qq/message")),
            str(settings.get("token", "")),
            payload,
        )
    except (HTTPError, URLError, TimeoutError, ValueError):
        await bot.send(event, "排队服务暂不可用，请稍后再试。")
        return
    if result.get("current"):
        reply = "你正在当前位。"
    elif result.get("queued"):
        reply = f"已在排队列表，第 {result['position']} 位。"
    else:
        reply = "未入队；请检查主播是否开放排队及免费排队。"
    await bot.send(event, reply)
