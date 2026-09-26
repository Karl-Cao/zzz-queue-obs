"""Run the shared official QQ account with secrets from the server environment."""

import json
import os


app_id = os.environ.get("PUBLIC_QQ_APP_ID", "").strip()
app_secret = os.environ.get("PUBLIC_QQ_APP_SECRET", "").strip()
bot_token = os.environ.get("PUBLIC_QQ_BOT_TOKEN", "")
if not app_id.isdigit() or len(app_secret) < 16 or len(bot_token) < 32:
    raise SystemExit("Set PUBLIC_QQ_APP_ID, PUBLIC_QQ_APP_SECRET and PUBLIC_QQ_BOT_TOKEN")

os.environ.setdefault("DRIVER", "~fastapi+~httpx+~websockets")
os.environ.setdefault("HOST", "127.0.0.1")
os.environ.setdefault("PORT", "18081")
os.environ["QQ_BOTS"] = json.dumps([{
    "id": app_id,
    "token": app_secret,
    "secret": app_secret,
    "intent": {
        "guilds": False,
        "guild_members": False,
        "guild_messages": False,
        "guild_message_reactions": False,
        "direct_message": False,
        "open_forum_event": False,
        "audio_live_member": False,
        "group_members": False,
        "c2c_group_at_messages": True,
        "interaction": False,
        "message_audit": False,
        "forum_event": False,
        "audio_action": False,
        "at_messages": False,
    },
}])

import bot  # noqa: E402

bot.nonebot.run()
