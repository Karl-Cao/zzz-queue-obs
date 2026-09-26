"""Require a real leading @bot mention for QQ group messages."""

from nonebot.adapters.onebot.v11 import Bot, GroupMessageEvent
from nonebot.exception import IgnoredException
from nonebot.message import event_preprocessor


def starts_with_bot_mention(message, self_id: str) -> bool:
    """Check the original OneBot segments, not text that merely looks like an @."""
    for segment in message:
        if segment.type == "text" and not str(segment.data.get("text", "")).strip():
            continue
        return segment.type == "at" and str(segment.data.get("qq", "")) == str(self_id)
    return False


@event_preprocessor
async def require_group_mention(bot: Bot, event) -> None:
    if isinstance(event, GroupMessageEvent) and not starts_with_bot_mention(
        event.original_message, bot.self_id
    ):
        raise IgnoredException("QQ group messages must start with @bot")
