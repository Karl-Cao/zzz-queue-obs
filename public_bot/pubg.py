"""Official PUBG public stats; no player credentials or shared-core dependency."""
from __future__ import annotations

from collections import OrderedDict, deque
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as PoolTimeout
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

HELP = '''PUBG 端游 · 使用指南
在群内真正 @机器人，输入以下口令：
① /pubg绑定 游戏昵称
例如：/pubg绑定 YourGameName（默认 Steam）
其他平台：/pubg绑定 xbox 游戏昵称
支持 steam / kakao / psn / xbox。
② /pubg查询 → 生涯战绩：场次、吃鸡、KD、场均伤害
③ /pubg排位 → 当前赛季段位、分数、KDA
④ /pubg最近比赛 → 可用记录中最新10场：时间、排名、击杀、伤害
⑤ /pubg解除绑定 → 删除自己保存的 PUBG 查询账号
⑥ /pubg帮助 → 查看本说明
无需扫码、Cookie 或密码。重新绑定可切换账号；绑定只保存查询目标，不验证账号归属。
不支持 PUBG Mobile / 和平精英。数据可能缓存5分钟；近期比赛只显示官方仍提供的已结束记录。'''
PLATFORMS = {'steam', 'kakao', 'psn', 'xbox'}
MODES = {'solo': '单排TPP', 'solo-fpp': '单排FPP', 'duo': '双排TPP',
         'duo-fpp': '双排FPP', 'squad': '四排TPP', 'squad-fpp': '四排FPP'}
TIERS = {'Bronze': '青铜', 'Silver': '白银', 'Gold': '黄金', 'Platinum': '铂金',
         'Diamond': '钻石', 'Master': '大师'}

class PubgError(Exception):
    pass

def is_pubg_command(text: str) -> bool:
    return text.strip().startswith('/') and text.strip()[1:].lstrip().lower().startswith('pubg')

def parse_command(text: str) -> tuple[str, str]:
    if not is_pubg_command(text):
        raise PubgError('请在群内 @机器人发送 /pubg帮助。')
    parts = text.strip()[1:].lstrip()[4:].strip().split(maxsplit=1)
    return (parts[0] if parts else '帮助', parts[1].strip() if len(parts) == 2 else '')

def parse_binding(arg: str) -> tuple[str, str]:
    parts = arg.strip().split(maxsplit=1)
    if not parts:
        raise PubgError('请发送 /pubg绑定 游戏昵称，例如 /pubg绑定 YourGameName。')
    platform = 'steam'
    if parts[0].lower() in PLATFORMS:
        platform = parts[0].lower()
        if len(parts) != 2:
            raise PubgError('平台后还需要游戏昵称，例如 /pubg绑定 steam YourGameName。')
        name = parts[1].strip()
    else:
        name = arg.strip()
    if not name or len(name) > 64 or ',' in name or any(ord(c) < 32 for c in name):
        raise PubgError('请复制单个游戏昵称，不要输入逗号、换行或多个玩家。')
    return platform, name

def number(value) -> float:
    try:
        return max(0.0, float(value or 0))
    except (ValueError, TypeError):
        return 0.0

def render_stats(stats: dict, ranked=False) -> list[str]:
    lines = []
    for mode, label in MODES.items():
        s = stats.get(mode) or {}
        rounds = int(number(s.get('roundsPlayed')))
        if not rounds:
            continue
        damage = number(s.get('damageDealt')) / rounds
        wins = int(number(s.get('wins')))
        if ranked:
            tier = s.get('currentTier') or {}
            rank = TIERS.get(tier.get('tier'), tier.get('tier') or '未定级')
            sub = str(tier.get('subTier') or '')
            lines.append(f"{label}：{rank}{sub}，{int(number(s.get('currentRankPoint')))}分\n"
                         f"{rounds}场 / 吃鸡{wins} / KDA {number(s.get('kda')):.2f} / 场均伤害{damage:.0f}")
        else:
            deaths = rounds-wins
            kd = f"{number(s.get('kills'))/deaths:.2f}" if deaths > 0 else '—（无死亡场次）'
            lines.append(f'{label}：{rounds}场 / 吃鸡{wins} / KD {kd} / 场均伤害{damage:.0f}')
    return lines

def match_summary(payload: dict, account: str) -> dict | None:
    attr = (payload.get('data') or {}).get('attributes') or {}
    for item in payload.get('included') or []:
        if item.get('type') != 'participant':
            continue
        stats = (item.get('attributes') or {}).get('stats') or {}
        if stats.get('playerId') == account:
            return {'time': str(attr.get('createdAt') or ''), 'mode': str(attr.get('gameMode') or ''),
                    'map': str(attr.get('mapName') or ''), 'rank': int(number(stats.get('winPlace'))),
                    'kills': int(number(stats.get('kills'))), 'damage': number(stats.get('damageDealt'))}
    return None

class PubgService:
    def __init__(self, key='', database=None, fetch=None, clock=time.monotonic):
        self.key = key.strip()
        default_db = '/var/lib/zzz-public-qq/pubg.sqlite3' if os.name != 'nt' else str(Path(__file__).resolve().parents[1]/'data/qq-runtime/pubg.sqlite3')
        self.database = Path(database or os.environ.get('PUBLIC_QQ_PUBG_DB', default_db))
        self.database.parent.mkdir(parents=True, exist_ok=True)
        with self.db() as c:
            c.execute('CREATE TABLE IF NOT EXISTS bindings (member TEXT PRIMARY KEY, platform TEXT NOT NULL, account TEXT NOT NULL, name TEXT NOT NULL)')
        self.clock, self.fetch = clock, fetch or self._http
        self.cache = OrderedDict()
        self.calls = deque()
        self.backoff = 0
        self.lock = threading.Lock()
        self.command_lock = threading.Lock()

    @contextmanager
    def db(self):
        c = sqlite3.connect(self.database, timeout=5)
        try:
            with c:
                yield c
        finally:
            c.close()

    def binding(self, member):
        with self.db() as c:
            return c.execute('SELECT platform,account,name FROM bindings WHERE member=?', (member,)).fetchone()

    @staticmethod
    def _http(path, key):
        headers = {'Accept': 'application/vnd.api+json', 'User-Agent': 'ZZZQueue-PUBG/1.0'}
        if key:
            headers['Authorization'] = 'Bearer '+key
        # Endpoint paths are constructed internally; never accept a viewer-supplied URL.
        with urlopen(Request('https://api.pubg.com/'+path, headers=headers), timeout=10) as r:
            raw = r.read(2*1024*1024+1)
            if len(raw) > 2*1024*1024:
                raise PubgError('PUBG 返回数据过大，请稍后重试。')
            return json.loads(raw)

    def request(self, path, ttl=300, limited=True):
        with self.lock:
            now = self.clock()
            cached = self.cache.get(path)
            if cached and cached[0] > now:
                self.cache.move_to_end(path)
                return cached[1]
            if limited:
                if not self.key:
                    raise PubgError('PUBG 查询尚未配置官方 API Key，请联系机器人管理员。无需向机器人发送密码或 Cookie。')
                while self.calls and now-self.calls[0] >= 60:
                    self.calls.popleft()
                if now < self.backoff or len(self.calls) >= 10:
                    raise PubgError('PUBG 官方查询额度暂时用完，请约1分钟后再试。')
                self.calls.append(now)
        try:
            payload = self.fetch(path, self.key if limited else '')
        except HTTPError as e:
            if e.code == 429:
                with self.lock:
                    self.backoff = self.clock()+60
                raise PubgError('PUBG 官方限流，请约1分钟后再试。') from None
            if e.code in (401, 403):
                raise PubgError('PUBG API Key 无效或无访问权限，请联系机器人管理员。') from None
            if e.code == 404:
                raise PubgError('未找到 PUBG 玩家或比赛数据，请核对平台和游戏昵称。') from None
            raise PubgError('PUBG 接口暂不可用，请稍后重试。') from None
        except (URLError, TimeoutError, OSError, ValueError):
            raise PubgError('PUBG 网络请求失败，请稍后重试。') from None
        if not isinstance(payload, dict) or 'data' not in payload:
            raise PubgError('PUBG 返回数据格式异常，请稍后重试。')
        with self.lock:
            self.cache[path] = (self.clock()+ttl, payload)
            self.cache.move_to_end(path)
            while len(self.cache) > 64:
                self.cache.popitem(last=False)
        return payload

    def handle(self, member: str, text: str) -> str:
        action, arg = parse_command(text)
        if action == '帮助':
            return HELP
        if action not in {'绑定', '查询', '排位', '最近比赛', '解除绑定'}:
            return '未知 PUBG 口令，请发送 /pubg帮助。'
        if action != '绑定' and arg:
            return f'此口令无需参数，请发送 /pubg{action}。'
        if not self.command_lock.acquire(blocking=False):
            return 'PUBG 正在处理其他查询，请稍后重试。'
        try:
            return self._handle(member, action, arg)
        except PubgError as e:
            return str(e)
        finally:
            self.command_lock.release()

    def _handle(self, member, action, arg):
        if action == '解除绑定':
            with self.db() as c:
                count = c.execute('DELETE FROM bindings WHERE member=?', (member,)).rowcount
            return '已解除你的 PUBG 查询绑定。' if count else '你尚未绑定 PUBG 查询账号。'
        if action == '绑定':
            platform, name = parse_binding(arg)
            payload = self.request(f'shards/{platform}/players?'+urlencode({'filter[playerNames]': name}), ttl=60)
            players = payload.get('data') or []
            if not isinstance(players, list) or len(players) != 1:
                raise PubgError('未找到唯一玩家，请核对平台并从游戏内复制完整昵称。')
            player = players[0]
            account = player.get('id', '')
            if not re.fullmatch(r'account\.[A-Za-z0-9_-]{8,80}', account):
                raise PubgError('PUBG 玩家 ID 格式异常，请稍后重试。')
            name = str((player.get('attributes') or {}).get('name') or name)[:64]
            with self.db() as c:
                c.execute('INSERT INTO bindings VALUES (?,?,?,?) ON CONFLICT(member) DO UPDATE SET platform=excluded.platform,account=excluded.account,name=excluded.name', (member, platform, account, name))
            return f'已绑定 PUBG 查询账号：{name}（{platform}）。\n发送 /pubg查询、/pubg排位 或 /pubg最近比赛。无需扫码。'
        binding = self.binding(member)
        if not binding:
            raise PubgError('请先发送 /pubg绑定 游戏昵称；使用方法见 /pubg帮助。')
        platform, account, name = binding
        base = f'shards/{platform}'
        player_path = f'{base}/players/{quote(account, safe="")}'
        if action == '查询':
            payload = self.request(player_path+'/seasons/lifetime')
            stats = ((payload.get('data') or {}).get('attributes') or {}).get('gameModeStats') or {}
            lines = render_stats(stats)
            return f'PUBG 生涯战绩 · {name}（{platform}）\n'+('\n'.join(lines) if lines else '暂无可用生涯战绩。')+'\n数据可能缓存5分钟。'
        if action == '排位':
            seasons = self.request(base+'/seasons', ttl=3600).get('data') or []
            current = [s for s in seasons if (s.get('attributes') or {}).get('isCurrentSeason')]
            if len(current) != 1:
                raise PubgError('暂未找到当前赛季，请稍后重试。')
            season = quote(current[0]['id'], safe='')
            payload = self.request(player_path+f'/seasons/{season}/ranked')
            stats = ((payload.get('data') or {}).get('attributes') or {}).get('rankedGameModeStats') or {}
            lines = render_stats(stats, ranked=True)
            return f'PUBG 当前赛季排位 · {name}（{platform}）\n'+('\n'.join(lines) if lines else '本赛季暂无排位战绩。')+'\n数据可能缓存5分钟。'
        player = self.request(player_path, ttl=60).get('data') or {}
        matches = ((player.get('relationships') or {}).get('matches') or {}).get('data') or []
        ids = list(dict.fromkeys(m.get('id') for m in matches if isinstance(m.get('id'), str) and re.fullmatch(r'[A-Za-z0-9_-]{8,100}', m['id'])))
        if not ids:
            return f'PUBG 最近比赛 · {name}\n官方当前没有提供近期已结束比赛记录。'
        # Player match IDs have no guaranteed order. Read timestamps before sorting.
        rows, failed = [], 0
        pool = ThreadPoolExecutor(max_workers=4)
        futures = [pool.submit(self.request, f'{base}/matches/{quote(i, safe="")}', 1800, False) for i in ids[:100]]
        try:
            for future in as_completed(futures, timeout=45):
                try:
                    row = match_summary(future.result(), account)
                    if row:
                        rows.append(row)
                except PubgError:
                    failed += 1
        except PoolTimeout:
            failed += sum(not f.done() for f in futures)
        finally:
            for future in futures:
                future.cancel()
            pool.shutdown(wait=False, cancel_futures=True)
        rows.sort(key=lambda r: r['time'], reverse=True)
        if not rows:
            raise PubgError('近期比赛详情暂时不可用，请稍后重试。')
        lines = [f'PUBG 最近比赛 · {name}（{platform}）']
        for r in rows[:10]:
            stamp = r['time'].replace('T', ' ').removesuffix('Z')
            lines.append(f"{stamp} UTC · {MODES.get(r['mode'], r['mode'])}\n第{r['rank']}名 / 击杀{r['kills']} / 伤害{r['damage']:.0f}")
        if failed or len(ids) > 100:
            lines.append('部分记录未能读取；以上为本次读取记录中最新10场。')
        lines.append('仅含官方可用记录；数据可能缓存。')
        return '\n'.join(lines)
