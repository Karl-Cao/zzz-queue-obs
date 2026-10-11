import sys
import ast
import asyncio
from types import SimpleNamespace
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'public_bot'))
from pubg import PubgService, PubgError, HELP, is_pubg_command, render_stats

ACCOUNT = 'account.'+'a'*32

class PubgTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)/'pubg.sqlite3'
        self.now = 0
        self.calls = []
        self.mode = 'ok'
        self.svc = PubgService('TEST-ONLY', self.path, self.fetch, lambda: self.now)

    def fetch(self, path, key):
        self.calls.append((path, key))
        if self.mode == '429':
            raise HTTPError('https://api.pubg.com', 429, '', {}, None)
        if self.mode == 'missing':
            return {'data': []}
        if '/matches/' in path:
            match = path.rsplit('/', 1)[-1]
            return {'data': {'attributes': {'createdAt': '2026-10-09T'+('12' if match.endswith('2') else '10')+':00:00Z', 'gameMode': 'squad-fpp'}},
                    'included': [{'type': 'participant', 'attributes': {'stats': {'playerId': ACCOUNT, 'winPlace': 2, 'kills': 5, 'damageDealt': 600}}}]}
        if path.endswith('/seasons'):
            return {'data': [{'id': 'current-season', 'attributes': {'isCurrentSeason': True}}]}
        if path.endswith('/ranked'):
            return {'data': {'attributes': {'rankedGameModeStats': {'squad-fpp': {'roundsPlayed': 10, 'wins': 2, 'kda': 3.1, 'damageDealt': 2500, 'currentRankPoint': 2000, 'currentTier': {'tier': 'Gold', 'subTier': '3'}}}}}}
        if path.endswith('/lifetime'):
            return {'data': {'attributes': {'gameModeStats': {'squad-fpp': {'roundsPlayed': 10, 'wins': 2, 'kills': 16, 'damageDealt': 2500}}}}}
        if '?' in path:
            return {'data': [{'id': ACCOUNT, 'attributes': {'name': 'TestPlayer'}}]}
        return {'data': {'relationships': {'matches': {'data': [{'id': 'match0001'}, {'id': 'match0002'}]}}}}

    def bind(self, member='one'):
        self.assertIn('已绑定', self.svc.handle(member, '/pubg绑定 TestPlayer'))

    def test_route_help_without_key_and_unbound_query(self):
        empty = PubgService('', self.path)
        self.assertIn('/pubg最近比赛', empty.handle('one', '/pubg帮助'))
        self.assertIn('先发送', empty.handle('one', '/pubg查询'))
        self.assertIn('API Key', empty.handle('one', '/pubg绑定 TestPlayer'))
        self.assertTrue(is_pubg_command('/PUBG帮助'))
        self.assertFalse(is_pubg_command('pubg帮助'))

    def test_members_isolated_persistent_and_failed_rebind_keeps_old(self):
        self.bind()
        self.assertIsNone(self.svc.binding('other'))
        self.assertEqual(PubgService('TEST-ONLY', self.path).binding('one')[1], ACCOUNT)
        self.mode = 'missing'
        self.assertIn('未找到', self.svc.handle('one', '/pubg绑定 NotFound'))
        self.assertEqual(self.svc.binding('one')[1], ACCOUNT)
        self.assertIn('尚未', self.svc.handle('other', '/pubg解除绑定'))
        self.assertIsNotNone(self.svc.binding('one'))
        self.assertIn('已解除', self.svc.handle('one', '/pubg解除绑定'))

    def test_stats_current_rank_and_no_matches(self):
        self.bind()
        self.assertIn('KD 2.00', self.svc.handle('one', '/pubg查询'))
        self.assertIn('场均伤害250', self.svc.handle('one', '/pubg查询'))
        self.assertIn('黄金3', self.svc.handle('one', '/pubg排位'))
        self.assertIn('KDA 3.10', self.svc.handle('one', '/pubg排位'))
        self.assertEqual(render_stats({}), [])
        self.assertIn('无死亡', render_stats({'solo': {'roundsPlayed': 1, 'wins': 1}})[0])

    def test_match_time_sorted_and_match_endpoint_has_no_key(self):
        self.bind()
        reply = self.svc.handle('one', '/pubg最近比赛')
        self.assertLess(reply.index('12:00:00'), reply.index('10:00:00'))
        self.assertIn('第2名 / 击杀5', reply)
        self.assertTrue(all(not key for path, key in self.calls if '/matches/' in path))

    def test_recent_defaults_to_ten_sorted_matches(self):
        self.bind()
        def fetch(path, key):
            result = self.fetch(path, key)
            if '/matches/' in path:
                day = int(path.rsplit('/', 1)[-1][-4:])
                result['data']['attributes']['createdAt'] = f'2026-09-{day:02d}T12:00:00Z'
            elif '/players/' in path and '/seasons/' not in path:
                result = {'data': {'relationships': {'matches': {'data': [{'id': f'match{i:04d}'} for i in range(1, 13)]}}}}
            return result
        self.svc.fetch = fetch
        reply = self.svc.handle('one', '/pubg最近比赛')
        self.assertEqual(reply.count('第2名 / 击杀5'), 10)
        self.assertLess(reply.index('2026-09-12'), reply.index('2026-09-03'))
        self.assertNotIn('2026-09-02', reply)
        self.assertNotIn('2026-09-01', reply)
        self.assertIn('最新10场', HELP)

    def test_cache_quota_and_429_cooldown(self):
        self.svc.request('same')
        self.svc.request('same')
        self.assertEqual(len(self.calls), 1)
        for i in range(9):
            self.svc.request('path'+str(i))
        with self.assertRaises(PubgError):
            self.svc.request('exhausted')
        self.now = 61
        self.mode = '429'
        with self.assertRaises(PubgError):
            self.svc.request('backoff')
        self.mode = 'ok'
        with self.assertRaises(PubgError):
            self.svc.request('still-blocked')
        self.now = 122
        self.svc.request('recovered')

    def test_actual_group_dispatch_replies_without_queue_or_core(self):
        root = Path(__file__).resolve().parents[1]
        tree = ast.parse((root/'public_bot/bot.py').read_text(encoding='utf-8'))
        fn = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'handle_group')
        fn.decorator_list = []
        sent = []
        async def reply(bot, event, text):
            sent.append(text)
        class Event:
            author = SimpleNamespace(member_openid='one')
            def get_plaintext(self):
                return '/pubg帮助'
        ns = {'Bot': object, 'GroupAtMessageCreateEvent': object, 'asyncio': asyncio,
              'normalize_command': lambda s: s[1:], 'is_pubg_command': is_pubg_command,
              'PUBG': self.svc, 'send_group_reply': reply, 'logger': SimpleNamespace(warning=lambda *a: None)}
        exec(compile(ast.Module(body=[fn],type_ignores=[]),str(root/'public_bot/bot.py'),'exec'),ns)
        asyncio.run(ns['handle_group'](object(),Event()))
        self.assertEqual(sent,[HELP])
        self.assertEqual(self.calls,[])

    def test_binding_platform_encoding_and_invalid_arguments(self):
        self.assertIn('xbox', self.svc.handle('one', '/pubg绑定 xbox Player #123'))
        self.assertIn('filter%5BplayerNames%5D=Player+%23123', self.calls[0][0])
        self.assertIn('单个', self.svc.handle('one', '/pubg绑定 A,B'))
        self.assertIn('无需参数', self.svc.handle('one', '/pubg解除绑定 someone'))
        self.assertIn('未知', self.svc.handle('one', '/pubg扫码登录'))
        self.assertIn('不验证账号归属', HELP)

if __name__ == '__main__':
    unittest.main()
