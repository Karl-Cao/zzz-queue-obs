"""Bind a unique WeGame search result without exposing internal account IDs."""
import re

from .summoner_name import normalize_lol_uid, normalize_summoner_name


def public_player_description(description: str) -> str:
    return re.sub(r'^\s*UID\s*[:：].*(?:\n|$)', '', description, flags=re.IGNORECASE | re.MULTILINE).strip()


async def search_and_bind(bot, event, search, bindings, error_reply):
    name = normalize_summoner_name(event.text)
    if name is None:
        return await bot.send('请发送 /lol绑定 玩家昵称#12345，昵称和数字编号都要填写。')
    players = await search(name)
    if isinstance(players, int):
        return await bot.send(error_reply(players))
    if not players:
        return await bot.send('未找到该召唤师，请从游戏内复制完整昵称和数字编号后重试。')
    if not isinstance(players, dict):
        return await bot.send('搜索结果异常，请稍后重试；当前绑定未更改。')
    if len(players) != 1:
        descriptions = [public_player_description(str(value)) for value in players.values()]
        return await bot.send('找到多个账号，未自动绑定；请核对完整昵称和数字编号。\n\n' + '\n\n'.join(descriptions))
    raw_uid, description = next(iter(players.items()))
    uid = normalize_lol_uid(raw_uid)
    if uid is None:
        return await bot.send('搜索结果中的账号信息异常，未更改绑定，请稍后重试。')
    result = await bindings.insert_uid(event.user_id, event.bot_id, uid, event.group_id, is_digit=False)
    if result not in (0, -2):
        return await bot.send('找到了账号，但绑定失败，请稍后重新 /lol绑定。')
    current = await bindings.get_uid_by_game(event.user_id, event.bot_id)
    if current != uid:
        switched = await bindings.switch_uid_by_game(event.user_id, event.bot_id, uid)
        if switched != 0:
            return await bot.send('账号已加入绑定列表，但切换当前查询账号失败，请稍后重新 /lol绑定。')
    return await bot.send(public_player_description(str(description)) + '\n\n已绑定为当前 LOL 查询账号，可直接发送 /lol查询 或 /lol对局记录。')
