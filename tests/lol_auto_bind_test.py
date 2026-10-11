import ast
import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace

root=Path(__file__).resolve().parents[1]/'qq/core_extensions/public_lol_bridge'
spec=importlib.util.spec_from_file_location('names',root/'summoner_name.py')
names=importlib.util.module_from_spec(spec);spec.loader.exec_module(names)
tree=ast.parse((root/'binding.py').read_text(encoding='utf-8'))
tree.body=[n for n in tree.body if not isinstance(n,ast.ImportFrom)]
ns={'normalize_lol_uid':names.normalize_lol_uid,'normalize_summoner_name':names.normalize_summoner_name}
exec(compile(tree,'binding-test','exec'),ns)


class Bindings:
    def __init__(self):self.rows={};self.switch_result=0
    async def insert_uid(self,user,bot,uid,group,is_digit):
        rows=self.rows.setdefault((user,bot),[])
        if uid in rows:return -2
        rows.append(uid);return 0
    async def get_uid_by_game(self,user,bot):
        rows=self.rows.get((user,bot),[])
        return rows[0] if rows else None
    async def switch_uid_by_game(self,user,bot,uid):
        if self.switch_result:return self.switch_result
        rows=self.rows[(user,bot)];rows.remove(uid);rows.insert(0,uid);return 0


class AutoBindTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.bindings=Bindings();self.messages=[];self.searches=[]
        self.players={'abcdef==:1':'玩家#12345 (铂金)\n区服：艾欧尼亚\n等级：85\nUID：abcdef==:1'}
        async def send(message):self.messages.append(message)
        async def search(name):self.searches.append(name);return self.players
        self.bot=SimpleNamespace(send=send);self.search=search
    async def run_search(self,user='caller',text='玩家#12345'):
        event=SimpleNamespace(user_id=user,bot_id='qqgroup',group_id='group',text=text)
        await ns['search_and_bind'](self.bot,event,self.search,self.bindings,lambda code:f'error {code}')
    async def test_unique_result_binds_without_showing_uid(self):
        await self.run_search()
        self.assertEqual(self.bindings.rows[('caller','qqgroup')],['abcdef==:1'])
        self.assertIn('已绑定',self.messages[-1]);self.assertIn('艾欧尼亚',self.messages[-1])
        self.assertNotIn('UID',self.messages[-1]);self.assertNotIn('abcdef',self.messages[-1])
    async def test_repeated_search_and_member_isolation(self):
        await self.run_search();await self.run_search();await self.run_search('other')
        self.assertEqual(len(self.bindings.rows[('caller','qqgroup')]),1)
        self.assertEqual(self.bindings.rows[('other','qqgroup')],['abcdef==:1'])
    async def test_search_selects_new_account_as_current(self):
        self.bindings.rows[('caller','qqgroup')]=['oldabc==:2']
        await self.run_search()
        self.assertEqual(self.bindings.rows[('caller','qqgroup')],['abcdef==:1','oldabc==:2'])
    async def test_ambiguous_result_does_not_bind_or_expose_uid(self):
        self.players['second==:2']='玩家#12345\nUID：second==:2'
        await self.run_search()
        self.assertEqual(self.bindings.rows,{})
        self.assertIn('多个账号',self.messages[-1]);self.assertNotIn('UID',self.messages[-1])
    async def test_no_result_and_api_errors_preserve_binding(self):
        self.bindings.rows[('caller','qqgroup')]=['oldabc==:2']
        for result in [{},8000014]:
            self.players=result;await self.run_search()
            self.assertEqual(self.bindings.rows[('caller','qqgroup')],['oldabc==:2'])
    async def test_missing_tag_does_not_search(self):
        await self.run_search(text='玩家')
        self.assertEqual(self.searches,[]);self.assertEqual(self.bindings.rows,{})
    async def test_invalid_returned_uid_does_not_bind(self):
        self.players={'invalid':'玩家#12345'};await self.run_search()
        self.assertEqual(self.bindings.rows,{})
    async def test_failed_selection_does_not_claim_current_success(self):
        self.bindings.rows[('caller','qqgroup')]=['oldabc==:2'];self.bindings.switch_result=-2
        await self.run_search()
        self.assertIn('切换当前查询账号失败',self.messages[-1])
