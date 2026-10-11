"""Exercise the deployed core guard without network calls or real credentials."""
import ast
import asyncio
from pathlib import Path
from types import SimpleNamespace
from http.cookies import SimpleCookie
import runpy
import unittest

ROOT = Path(__file__).resolve().parents[1]


class GameQrWorkflowTest(unittest.IsolatedAsyncioTestCase):
    async def test_finish_checks_selected_game_before_returning_credentials(self):
        core = ROOT / 'data/oracle-deploy/core-login-review/gsuid_core/utils/cookie_manager/qrlogin.py'
        if not core.exists():
            self.skipTest('Isolated patched core checkout is not available')
        tree = ast.parse(core.read_text(encoding='utf-8'))
        finish = next(node for node in tree.body if isinstance(node, ast.AsyncFunctionDef) and node.name == '_finish_qrcode_login')
        helpers = runpy.run_path(str(ROOT / 'public_bot/core-patches/verified_game_uid.py'))
        roles = []
        sent = []

        async def cookie(*args):
            return {'cookie_token': 'TEST-ONLY'}

        async def lookup(*args):
            return roles

        async def send(message):
            sent.append(message)

        namespace = {'Any': object, 'Bot': object, 'Event': object, 'SimpleCookie': SimpleCookie,
                     'owns_game_uid': helpers['owns_game_uid'], 't': lambda key: key,
                     'mys_api': SimpleNamespace(get_cookie_token_by_stoken=cookie, get_mihoyo_bbs_info=lookup),
                     'logger': SimpleNamespace(info=lambda *args: None, warning=lambda *args: None),
                     'MessageSegment': SimpleNamespace(markdown=lambda value: value)}
        exec(compile(ast.Module(body=[finish], type_ignores=[]), str(core), 'exec'), namespace)
        ev = SimpleNamespace(user_id='initiator')
        bot = SimpleNamespace(send=send)
        data = {'tokens': [{'name': 'stoken', 'token': 'TEST-ONLY'}], 'user_info': {'aid': 'TEST-ONLY', 'mid': 'TEST-ONLY'}}
        fn = namespace['_finish_qrcode_login']
        roles.append({'game_id': 8, 'game_role_id': '102823666'})
        self.assertEqual(await fn(bot, ev, ev.user_id, '102823666', True, data, '2'), '')
        self.assertIn('原神UID不符', sent[-1])
        roles[:] = [{'game_id': 2, 'game_role_id': '102823666'}]
        self.assertIn('cookie_token=', await fn(bot, ev, ev.user_id, '102823666', True, data, '2'))
        self.assertEqual(await fn(bot, ev, ev.user_id, '102823666', True, data, '8'), '')
        self.assertIn('绝区零UID不符', sent[-1])
        self.assertEqual(await fn(bot, ev, ev.user_id, '102823666', False, None, '2'), '')
        self.assertIn('initiator', sent[-1])
        self.assertIn('二维码已过期', sent[-1])
