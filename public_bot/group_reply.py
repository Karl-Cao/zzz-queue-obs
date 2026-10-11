"""Passive group replies with a genuine QQ mention of the requesting member."""
import html
import re
from nonebot.adapters.qq.message import MessageSegment


async def send_group_reply(bot, event, text):
    member = str(event.author.member_openid)
    if not re.fullmatch(r"[A-Za-z0-9_-]{5,128}", member):
        raise ValueError("Invalid QQ member identifier")
    # Treat viewer names and reply text as text, never as injected Markdown/tags.
    body = re.sub(r"([\\`*_{}\[\]()#+.!|>~-])", r"\\\1", html.escape(str(text), quote=False))
    event._reply_seq = getattr(event, '_reply_seq', 0) + 1
    return await bot.send_to_group(
        group_openid=str(event.group_openid), msg_id=str(event.id), msg_seq=event._reply_seq,
        message=MessageSegment.markdown(f'<qqbot-at-user id="{member}" /> {body}'),
    )
