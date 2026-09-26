import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'public_bot'))
from commands import normalize_command,is_zzz_command,unsupported_zzz_command

class CommandPanelTest(unittest.TestCase):
    def test_panel_and_typed_queries_keep_arguments(self):
        for text in ['zzz角色图鉴 零号安比','zzz角色攻略 安比']:
            self.assertTrue(is_zzz_command('/'+text))
            self.assertTrue(is_zzz_command(text))
            self.assertEqual(normalize_command(' /'+text+' '),text)
        self.assertFalse(is_zzz_command('/排队'))
        self.assertFalse(is_zzz_command('/绑定B站 用户'))
        self.assertEqual(normalize_command('/绑定B站 用户'),'绑定B站 用户')
        self.assertEqual(normalize_command('/排队'),'排队')
        self.assertTrue(unsupported_zzz_command('/zzz角色图鉴 零号安比'))
        self.assertFalse(unsupported_zzz_command('/zzz角色攻略 安比'))

if __name__=='__main__': unittest.main()
