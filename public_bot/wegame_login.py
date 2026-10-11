"""Requester-owned WeGame QR sessions; credentials never appear in chat."""
import asyncio
import csv
import io
import re
import time
from urllib.parse import urlparse

import httpx

APP_ID = '1600001063'
CALLBACK = 'https://www.wegame.com.cn/middle/login/third_callback.html'
LOGIN_HOST = 'https://ssl.ptlogin2.qq.com'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'


def qr_token(signature: str) -> int:
    value = 0
    for char in signature:
        value = (value * 33 + ord(char)) & 0x7fffffff
    return value


def parse_status(text: str) -> list[str]:
    match = re.fullmatch(r'\s*ptuiCB\((.*)\);?\s*', text, re.S)
    if not match:
        raise ValueError('Invalid QR response')
    fields = next(csv.reader([match[1]], quotechar="'", skipinitialspace=True))
    if len(fields) < 5 or fields[0] not in {'0', '65', '66', '67', '68'}:
        raise ValueError('Unsupported QR status')
    return fields


def account_number(value: str) -> str:
    number = value.removeprefix('o').lstrip('0')
    if not re.fullmatch(r'[1-9]\d{4,11}', number):
        raise ValueError('Invalid QQ account')
    return number


def allowed_jump(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == 'https' and parsed.hostname in {
        'ssl.ptlogin2.qq.com', 'ptlogin2.qq.com', 'ptlogin2.wegame.com.cn', 'www.wegame.com.cn',
    } and parsed.port in {None, 443} and not parsed.username and not parsed.password


class WeGameSession:
    def __init__(self, expected_qq: str):
        self.expected_qq = account_number(expected_qq)
        self.client = httpx.AsyncClient(timeout=20, headers={'User-Agent': UA, 'Referer': CALLBACK})
        self.signature = ''
        self.deadline = time.monotonic() + 120

    async def close(self) -> None:
        await self.client.aclose()

    async def create(self) -> bytes:
        response = await self.client.get(LOGIN_HOST + '/ptqrshow', params={
            'appid': APP_ID, 'daid': '733', 'e': '2', 'l': 'M', 's': '3', 'd': '72',
            'v': '4', 't': str(time.time()), 'u1': CALLBACK,
        })
        response.raise_for_status()
        self.signature = response.cookies.get('qrsig', '')
        if not self.signature or not response.content.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError('QR creation failed')
        return response.content

    async def wait(self) -> dict[str, str]:
        while time.monotonic() < self.deadline:
            await asyncio.sleep(2)
            response = await self.client.get(LOGIN_HOST + '/ptqrlogin', params={
                'ptqrtoken': str(qr_token(self.signature)), 'from_ui': '1',
                'aid': APP_ID, 'daid': '733', 'u1': CALLBACK,
            })
            response.raise_for_status()
            status = parse_status(response.text)
            if status[0] in {'65', '68'}:
                raise TimeoutError('QR expired or refused')
            if status[0] == '0':
                return await self.exchange(status[2])
        raise TimeoutError('QR expired')

    async def exchange(self, jump: str) -> dict[str, str]:
        for _ in range(5):
            if not allowed_jump(jump):
                raise ValueError('Untrusted login redirect')
            response = await self.client.get(jump, follow_redirects=False)
            location = response.headers.get('location')
            if not location:
                response.raise_for_status()
                break
            jump = str(response.url.join(location))
        cookies = {cookie.name: cookie.value for cookie in self.client.cookies.jar}
        qq = account_number(cookies.get('uin') or cookies.get('p_uin') or '')
        if qq != self.expected_qq:
            raise PermissionError('Scanned QQ does not match requester expected account')
        if not cookies.get('skey') or not cookies.get('p_skey'):
            raise ValueError('WeGame login keys missing')
        response = await self.client.post('https://www.wegame.com.cn/api/middle/clientapi/auth/login_by_qq', json={
            'login_info': {'qq_info_type': 6, 'uin': qq, 'sig': cookies['p_skey'],
                           'qqinfo_ext': [{'qq_info_type': 3, 'sig': cookies['skey']}]},
            'config_params': {'lang_type': 0}, 'mappid': '10001', 'mcode': '', 'clienttype': '1000005',
        })
        response.raise_for_status()
        cookies.update({cookie.name: cookie.value for cookie in self.client.cookies.jar})
        if not cookies.get('tgp_ticket') or not cookies.get('tgp_id'):
            raise ValueError('WeGame did not issue query credentials')
        return {key: value for key, value in cookies.items() if key in {
            'uin', 'p_uin', 'skey', 'p_skey', 'tgp_ticket', 'tgp_id', 'pt4_token',
        }}


class WeGameGroupLogin:
    def __init__(self, bridge_url: str, token: str):
        self.bridge_url = bridge_url
        self.token = token
        self.active: set[str] = set()

    async def send_mention(self, bot, event, text: str) -> None:
        from nonebot.adapters.qq.message import MessageSegment
        name = getattr(event.author, 'username', None) or '本次授权发起人'
        await bot.send(event, MessageSegment.text(f'{name}：{text}'))

    async def run(self, bot, event, command: str) -> None:
        from nonebot.adapters.qq.message import MessageSegment
        member = str(event.author.member_openid)
        match = re.fullmatch(r'lol扫码登[录陆]\s+([1-9]\d{4,11})', command, re.I)
        if not match:
            await self.send_mention(bot, event, '请发送 /lol扫码登录 你的QQ号（例如 /lol扫码登录 123456789）。请本人使用该QQ扫码；不要发送密码或Cookie。')
            return
        if member in self.active:
            await self.send_mention(bot, event, '你已有待确认的 WeGame 二维码，请先完成或等待两分钟过期。')
            return
        self.active.add(member)
        session = WeGameSession(match[1])
        try:
            png = await session.create()
            name = getattr(event.author, 'username', None) or '本次授权发起人'
            caption = f'WeGame 查询授权 · {name} · QQ尾号 {match[1][-4:]}\n请本人使用该QQ扫码并确认；群内其他成员请勿代扫。约两分钟有效。仅用于本机器人LOL查询；会保存WeGame查询凭据，Cookie不会在群内显示。'
            await bot.send(event, MessageSegment.text(caption) + MessageSegment.file_image(png))
            cookies = await session.wait()
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(self.bridge_url, headers={'Authorization': 'Bearer ' + self.token},
                    json={'member': member, 'cookie': '; '.join(f'{k}={v}' for k, v in cookies.items())})
                response.raise_for_status()
            await self.send_mention(bot, event, 'WeGame授权已保存，仅供你自己的LOL查询使用。请发送 /lol绑定 玩家昵称#12345，再用 /lol查询 或 /lol对局记录。')
        except PermissionError:
            await self.send_mention(bot, event, '扫码QQ与你输入的QQ号不一致，未保存任何凭据。请本人重新发起授权。')
        except TimeoutError:
            await self.send_mention(bot, event, '你的 WeGame 二维码已过期或被拒绝；未保存凭据。请重新 /lol扫码登录 QQ号。')
        except (httpx.HTTPError, ValueError):
            await self.send_mention(bot, event, 'WeGame授权未完成，未确认保存。请稍后重试；如仍失败请联系机器人管理员检查服务端。')
        finally:
            self.active.discard(member)
            await session.close()
