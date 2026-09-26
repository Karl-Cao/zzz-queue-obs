"""QQ transport for the bundled ZZZ Queue + gsuid_core services."""

import os

import nonebot
from fastapi import HTTPException, Request

nonebot.init()
OFFICIAL = os.environ.get("ZZZ_QUEUE_QQ_OFFICIAL") == "1" or bool(getattr(nonebot.get_driver().config, "qq_bots", None))
if OFFICIAL:
    from nonebot.adapters.qq import Adapter

    nonebot.get_driver().register_adapter(Adapter)
    nonebot.load_plugin("official_queue")
else:
    from nonebot.adapters.onebot.v11 import Adapter

    nonebot.get_driver().register_adapter(Adapter)
    import mention_gate  # noqa: E402,F401 - filter OneBot group messages

nonebot.load_plugin("GenshinUID")


@nonebot.get_app().get("/zzz-queue/status")
async def local_status(request: Request):
    if request.client is None or request.client.host not in {"127.0.0.1", "::1"}:
        raise HTTPException(status_code=403)
    return {"app": "zzz-queue-qq", "mode": "official" if OFFICIAL else "onebot", "bots": list(nonebot.get_bots())}

if __name__ == "__main__":
    nonebot.run()
