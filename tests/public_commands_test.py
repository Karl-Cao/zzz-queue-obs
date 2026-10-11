import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'public_bot'))
from commands import normalize_command,is_zzz_command,is_game_command,is_group_qr_login_command,unsupported_zzz_command

class CommandPanelTest(unittest.TestCase):
    def test_game_routes_keep_slash_and_reject_credentials(self):
        for text in ['/zzz帮助', '/ys帮助', '/ys角色攻略 胡桃', '/lol搜索 Wuyi', '/lol查询']:
            self.assertTrue(is_game_command(text))
            self.assertFalse(is_game_command(text[1:]))
        for text in ['/排队', '/绑定B站', '/core重启', '/ys', '/lol添加CK secret', '/ys添加Cookie secret', '/zzz绑定设备']:
            self.assertFalse(is_game_command(text))

    def test_panel_and_typed_queries_keep_arguments(self):
        for text in ['zzz角色图鉴 零号安比','zzz角色攻略 安比']:
            self.assertTrue(is_zzz_command('/'+text))
            self.assertFalse(is_zzz_command(text))
            self.assertEqual(normalize_command(' /'+text+' '),text)
        self.assertFalse(is_zzz_command('/排队'))
        self.assertFalse(is_zzz_command('/绑定B站 用户'))
        self.assertEqual(normalize_command('/绑定B站 用户'),'绑定B站 用户')
        self.assertEqual(normalize_command('/排队'),'排队')
        self.assertFalse(unsupported_zzz_command('/zzz角色图鉴 零号安比'))
        self.assertFalse(unsupported_zzz_command('/zzz角色攻略 安比'))
        self.assertFalse(unsupported_zzz_command('/zzz驱动盘 混沌爵士'))
        self.assertTrue(unsupported_zzz_command('/zzz音擎攻略 街头巨星'))

    def test_group_qr_login_requires_exact_slash_command(self):
        self.assertFalse(is_game_command('/gs帮助'))
        self.assertFalse(is_group_qr_login_command('/gs扫码登录'))
        self.assertFalse(is_group_qr_login_command('/扫码登录'))
        self.assertFalse(is_group_qr_login_command('/扫码登陆'))
        self.assertTrue(is_group_qr_login_command('/ys扫码登录'))
        self.assertTrue(is_group_qr_login_command('/zzz扫码登录'))
        self.assertFalse(is_group_qr_login_command('ys扫码登录'))
        self.assertFalse(is_group_qr_login_command('/ys扫码登录 其他人'))
        self.assertFalse(is_group_qr_login_command('扫码登录'))
        self.assertFalse(is_group_qr_login_command('/扫码登录 其他人'))

if __name__=='__main__': unittest.main()
