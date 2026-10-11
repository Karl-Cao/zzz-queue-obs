import asyncio
from copy import deepcopy
from hashlib import sha256
import json
from io import BytesIO
from pathlib import Path

from PIL import Image

from gsuid_core.ai_core.trigger_bridge import ai_return
from gsuid_core.utils.api.enka.request import get_enka_info

from ..genshinuid_enka.draw_char_card import draw_char_card
from ..genshinuid_enka.draw_normal import (
    get_artifacts_card,
    get_bg_card,
    get_char_card_base,
    get_char_img,
)
from ..genshinuid_enka.to_data import enka_to_dict
from ..genshinuid_enka.mono.Character import get_char
from ..utils.image.convert import convert_img
from ..utils.map.name_covert import alias_to_char_name

_RENDER_LOCK = asyncio.Lock()


async def render_comparison(uid: str, name: str) -> list[str] | str:
    if _RENDER_LOCK.locked():
        return "面板对比正在出图，请稍后再试。"
    async with _RENDER_LOCK:
        return await _render_snapshot(uid, name)


async def _render_snapshot(uid: str, name: str) -> list[str] | str:
    raw = await get_enka_info(uid, 'enka')
    if isinstance(raw, str):
        return raw
    if raw is None or not raw['avatarInfoList']:
        return "没有公开展示角色，请先在游戏中开启角色详情展示。"
    frozen = json.dumps(raw, sort_keys=True, ensure_ascii=False)
    snapshot = sha256(frozen.encode()).hexdigest()[:12]
    data_list = await enka_to_dict(uid, deepcopy(raw))
    if isinstance(data_list, str):
        return data_list
    canonical = await alias_to_char_name(name)
    matches = [item for item in data_list if item['avatarName'] == canonical]
    if not matches:
        return "这个角色不在当前公开展示中，请换成展示角色或在游戏中调整展示后重试。"
    data = matches[0]
    character = await get_char(deepcopy(data))
    if isinstance(character, str):
        return character
    new_character = deepcopy(character)
    old_character = deepcopy(character)
    new = await draw_char_card(new_character, None)
    old = await get_bg_card(old_character.char_element, 762, Image.new("RGBA", (1, 1)))
    art = await get_char_img(old_character)
    old.paste(art, (0, 0), art)
    base = await get_char_card_base(old_character)
    old.paste(base, (0, 0), base)
    await get_artifacts_card(old_character, old)
    process = await asyncio.create_subprocess_exec(
        '/opt/zzz-plugin-staging/enkacard-env/bin/python', str(Path(__file__).with_name('enkacard_runner.py')),
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        cwd='/var/lib/zzz-public-qq/panel-renderer', env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':'/var/lib/zzz-public-qq/panel-renderer'},
    )
    payload = json.dumps({'raw':raw, 'avatarId':str(data['avatarId'])}).encode()
    try:
        output, _ = await asyncio.wait_for(process.communicate(payload), timeout=120)
    except TimeoutError:
        process.kill()
        await process.wait()
        return "EnkaCard 出图超时，请稍后重试。"
    if process.returncode != 0 or not output.startswith(b'\x89PNG\r\n\x1a\n'):
        return "EnkaCard 出图失败；未输出不完整的对比图，请联系管理员检查渲染资源。"
    third = Image.open(BytesIO(output))
    ai_return(f"原神角色 {name} 的三种UI使用同一缓存快照 {snapshot}；仅比较界面，默认样式未改变。")
    return [await convert_img(image) for image in (new, old, third)]
