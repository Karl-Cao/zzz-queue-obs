"""Verify request context stays isolated across simultaneous group members."""
import ast
import asyncio
import importlib.util
import unittest
from contextvars import ContextVar
from functools import wraps
from pathlib import Path
from types import SimpleNamespace

source = Path(__file__).resolve().parents[1] / 'qq/core_extensions/public_lol_bridge/__init__.py'
tree = ast.parse(source.read_text(encoding='utf-8'))
function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'scope_handler')
module = ast.Module(body=[ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0), function], type_ignores=[])
context = ContextVar('scope-test', default=None)
spec=importlib.util.spec_from_file_location('scope_names',source.with_name('summoner_name.py'))
names=importlib.util.module_from_spec(spec);spec.loader.exec_module(names)
async def bind_name(bot,event):return event.text,context.get()
namespace = {'wraps': wraps, 'current_member': context, 'normalize_summoner_name': names.normalize_summoner_name,
             'normalize_binding_argument': names.normalize_binding_argument,'search_and_bind_lol':bind_name}
exec(compile(ast.fix_missing_locations(module), str(source), 'exec'), namespace)
scope_handler = namespace['scope_handler']


class LOLScopeTest(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_members_do_not_share_authorization_context(self):
        async def callback(bot, event):
            await asyncio.sleep(0.01)
            return context.get()
        handler = scope_handler(callback)
        result = await asyncio.gather(handler(None, SimpleNamespace(bot_id='qqgroup', user_id='a', command='查询')),
                                      handler(None, SimpleNamespace(bot_id='qqgroup', user_id='b', command='查询')))
        self.assertEqual(result, ['a', 'b'])
        self.assertIsNone(context.get())

    async def test_binding_receives_only_uid_and_area(self):
        async def callback(bot, event):
            return event.text
        event = SimpleNamespace(bot_id='qqgroup', user_id='a', command='绑定UID', text='UID： abcdef==:1')
        self.assertEqual(await scope_handler(callback)(None, event), 'abcdef==:1')

    async def test_failure_and_non_group_context_do_not_leak(self):
        async def failure(bot, event):
            raise RuntimeError('test')
        with self.assertRaises(RuntimeError):
            await scope_handler(failure)(None, SimpleNamespace(bot_id='qqgroup', user_id='a', command='查询'))
        self.assertIsNone(context.get())
        async def callback(bot, event): return context.get()
        self.assertIsNone(await scope_handler(callback)(None, SimpleNamespace(bot_id='onebot', user_id='a', command='查询')))

    async def test_full_tag_reaches_search_without_being_removed(self):
        async def callback(bot, event):
            return event.text, context.get()
        event = SimpleNamespace(bot_id='qqgroup', user_id='a', command='搜索', text='玩家#00123')
        self.assertEqual(await scope_handler(callback)(None, event), ('玩家#00123', 'a'))
        self.assertIsNone(context.get())

    async def test_binding_full_name_uses_named_binding_and_owned_context(self):
        async def should_not_run(bot,event):raise AssertionError('Manual UID handler must not receive a nickname')
        event=SimpleNamespace(bot_id='qqgroup',user_id='a',command='绑定',text='玩家#00123')
        self.assertEqual(await scope_handler(should_not_run)(None,event),('玩家#00123','a'))
        self.assertIsNone(context.get())

    async def test_short_parsed_alias_keeps_manual_uid_without_prefix(self):
        async def callback(bot,event):return event.text
        for text in ('UID abcdef==:1','UIDabcdef==:1'):
            event=SimpleNamespace(bot_id='qqgroup',user_id='a',command='绑定',text=text)
            self.assertEqual(await scope_handler(callback)(None,event),'abcdef==:1')


if __name__ == '__main__': unittest.main()
