import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'public_bot'))
from qq_event_compat import normalize_group_references


class QQEventCompatibilityTest(unittest.TestCase):
    def test_incomplete_history_preserves_command_without_mutating_input(self):
        data = {'content': ' /ys刷新面板', 'message_type': 103,
                'msg_elements': [{'content': 'historical messages'}]}
        result = normalize_group_references(data)
        self.assertEqual(result['content'], data['content'])
        self.assertIsNone(result['msg_elements'])
        self.assertEqual(len(data['msg_elements']), 1)

    def test_valid_references_and_regular_messages_unchanged(self):
        valid = {'content': '/ys帮助', 'message_type': 103,
                 'msg_elements': [{'content': 'quoted text', 'message_type': 0, 'msg_idx': 'ref'}]}
        self.assertIs(normalize_group_references(valid), valid)
        ordinary = {'content': '/排队', 'message_type': 0}
        self.assertIs(normalize_group_references(ordinary), ordinary)

    def test_mixed_references_keep_valid_entry(self):
        good = {'content': 'quoted text', 'message_type': 0, 'msg_idx': 'ref'}
        result = normalize_group_references({'message_type': 103,
                                             'msg_elements': [{'content': 'history'}, good]})
        self.assertEqual(result['msg_elements'], [good])

    def test_ordinary_command_with_incomplete_context(self):
        data = {'content': ' /ys帮助 ', 'message_type': 0,
                'msg_elements': [{'attachments': [], 'content': 'context'}]}
        self.assertEqual(normalize_group_references(data),
                         {**data, 'msg_elements': None})


if __name__ == '__main__':
    unittest.main()
