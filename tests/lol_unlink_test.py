"""Unlink only the caller's selected LOL account."""
import ast
import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace

root = Path(__file__).resolve().parents[1] / 'qq/core_extensions/public_lol_bridge'
spec = importlib.util.spec_from_file_location('summoner_name', root / 'summoner_name.py')
names = importlib.util.module_from_spec(spec)
spec.loader.exec_module(names)
tree = ast.parse((root / '__init__.py').read_text(encoding='utf-8'))
function = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'unlink_lol')
function.body = [n for n in function.body if not isinstance(n, ast.ImportFrom)]


class Bindings:
    def __init__(self):
        self.records = {('caller', 'qqgroup'): ['first==:1', 'second==:2'], ('other', 'qqgroup'): ['first==:1']}

    async def get_uid_by_game(self, user, bot):
        rows = self.records.get((user, bot), [])
        return rows[0] if rows else None

    async def delete_uid(self, user, bot, uid):
        rows = self.records.get((user, bot), [])
        if uid not in rows:
            return -1
        rows.remove(uid)
        return 0


class UnlinkTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.bindings = Bindings()
        self.messages = []
        async def send(message):
            self.messages.append(message)
        self.bot = SimpleNamespace(send=send)
        namespace = {'LOLBind': self.bindings, 'normalize_lol_uid': names.normalize_lol_uid}
        module = ast.Module(body=[ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0), function], type_ignores=[])
        exec(compile(ast.fix_missing_locations(module), 'unlink-test', 'exec'), namespace)
        self.unlink = namespace['unlink_lol']

    async def run_command(self, text='', user='caller'):
        await self.unlink(self.bot, SimpleNamespace(user_id=user, bot_id='qqgroup', text=text))

    async def test_no_argument_removes_current_only_for_caller(self):
        await self.run_command()
        self.assertEqual(self.bindings.records[('caller', 'qqgroup')], ['second==:2'])
        self.assertEqual(self.bindings.records[('other', 'qqgroup')], ['first==:1'])

    async def test_explicit_uid_removes_selected_account(self):
        await self.run_command('UID： second==:2')
        self.assertEqual(self.bindings.records[('caller', 'qqgroup')], ['first==:1'])

    async def test_unknown_uid_does_not_remove_current(self):
        await self.run_command('unknown==:3')
        self.assertEqual(len(self.bindings.records[('caller', 'qqgroup')]), 2)
        self.assertIn('不在', self.messages[-1])

    async def test_unbound_member_gets_hint(self):
        await self.run_command(user='unbound')
        self.assertIn('还没有绑定', self.messages[-1])

    async def test_invalid_uid_does_not_remove_anything(self):
        await self.run_command('玩家#12345')
        self.assertEqual(len(self.bindings.records[('caller', 'qqgroup')]), 2)
        self.assertIn('格式不正确', self.messages[-1])


if __name__ == '__main__':
    unittest.main()
