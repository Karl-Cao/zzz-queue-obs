from gsuid_core.bot import Bot
from gsuid_core.models import Event
from gsuid_core.sv import SV

from ..utils.convert import get_uid
from ..utils.message import UID_HINT
from .render import render_comparison

sv_ui_compare = SV("原神面板UI对比", priority=5)


@sv_ui_compare.on_command(
    "面板对比",
    to_ai="""原神同数据面板UI对比：依次发送新版、旧版组件和EnkaCard样式的三张图片。
    Args:
        text: 已刷新展示角色的名字，例如 胡桃。
    """,
)
async def compare_panels(bot: Bot, ev: Event) -> None:
    uid = await get_uid(bot, ev)
    if uid is None:
        await bot.send(UID_HINT)
        return
    name = ev.text.strip()
    if not name:
        await bot.send("请在面板对比后填写角色名；先刷新公开展示面板，再选择其中一位角色。")
        return
    result = await render_comparison(uid, name)
    if isinstance(result, str):
        await bot.send(result)
    else:
        for image in result:
            await bot.send(image)
