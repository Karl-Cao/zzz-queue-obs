"""gsuid_core adapter for the local ZZZ Queue service."""

import asyncio
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from gsuid_core.bot import Bot
from gsuid_core.models import Event
from gsuid_core.sv import Plugins, SV


CONFIG = Path(os.environ.get("ZZZ_QUEUE_QQ_CONFIG") or Path(__file__).with_name("settings.json"))
Plugins(name="gsuid_queue", allow_empty_prefix=True)
sv = SV("ZZZ Queue QQ", pm=6, area="GROUP")


def _post(url: str, token: str, payload: dict) -> dict:
    request = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Queue-QQ-Token": token},
        method="POST",
    )
    with urlopen(request, timeout=5) as response:
        return json.load(response)


@sv.on_fullmatch("排队")
async def queue_join(bot: Bot, ev: Event):
    # Official QQ messages use OpenIDs and are handled by official_queue.py.
    if ev.bot_id != "onebot" or ev.user_type != "group" or not ev.is_tome or not CONFIG.exists():
        return
    settings = json.loads(CONFIG.read_text(encoding="utf-8"))
    if str(ev.group_id) != str(settings.get("group_id", "")):
        return
    sender = ev.sender or {}
    name = str(sender.get("card") or sender.get("nickname") or ev.user_id).strip()
    payload = {
        "groupId": str(ev.group_id),
        "userId": str(ev.user_id),
        "messageId": str(ev.msg_id),
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
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        await bot.send(f"排队服务暂不可用：{exc}")
        return
    if result.get("current"):
        reply = "你正在当前位。"
    elif result.get("queued"):
        reply = f"已在排队列表，第 {result['position']} 位。"
    else:
        reply = "未入队；请检查主播是否开放排队及免费排队。"
    await bot.send(reply)
