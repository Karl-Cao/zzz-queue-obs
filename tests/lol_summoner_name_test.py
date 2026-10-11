"""Full summoner identities must not collapse duplicate names."""
import importlib.util
import unittest
from pathlib import Path

source = Path(__file__).resolve().parents[1] / 'qq/core_extensions/public_lol_bridge/summoner_name.py'
spec = importlib.util.spec_from_file_location('summoner_name', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
normalize = module.normalize_summoner_name
normalize_uid = module.normalize_lol_uid


class SummonerNameTest(unittest.TestCase):
    def test_duplicate_names_keep_different_tags(self):
        self.assertEqual(normalize('玩家#12345'), '玩家#12345')
        self.assertEqual(normalize('玩家#67890'), '玩家#67890')
        self.assertNotEqual(normalize('玩家#12345'), normalize('玩家#67890'))

    def test_preserves_zeroes_and_spaces_inside_name(self):
        self.assertEqual(normalize('  My Player#00123  '), 'My Player#00123')

    def test_fullwidth_separator(self):
        self.assertEqual(normalize('玩家＃12345'), '玩家#12345')

    def test_incomplete_or_ambiguous_name_is_rejected(self):
        for value in ('玩家', '玩家#', '#12345', '玩家#abc', '玩家#１２３', '玩家#123#456'):
            with self.subTest(value=value):
                self.assertIsNone(normalize(value))

    def test_copied_uid_label_is_removed_without_changing_account(self):
        self.assertEqual(normalize_uid(' UID： iUYU0tVa6XEDftPi5ALtfw==:1 '), 'iUYU0tVa6XEDftPi5ALtfw==:1')
        self.assertEqual(normalize_uid('uid: abcdef==:01'), 'abcdef==:1')
        self.assertEqual(normalize_uid('abcdef==:1'), 'abcdef==:1')

    def test_invalid_uid_does_not_reach_api(self):
        for value in ('玩家#12345', 'abcdef==:0', 'abcdef==:abc', '说明 abcdef==:1', 'abcdef==:1:2'):
            with self.subTest(value=value):
                self.assertIsNone(normalize_uid(value))

    def test_short_alias_does_not_store_command_uid_prefix(self):
        for command, value in [('绑定', 'UID abcdef==:1'), ('绑定', 'UIDabcdef==:1'),
                               ('绑定uid', ' abcdef==:1'), ('绑定UID', 'abcdef==:1')]:
            self.assertEqual(module.normalize_binding_argument(command,value),'abcdef==:1')
        self.assertEqual(module.normalize_binding_argument('绑定UID','UIDabcdef==:1'),'UIDabcdef==:1')


if __name__ == '__main__':
    unittest.main()
