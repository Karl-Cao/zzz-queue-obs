import asyncio
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'public_bot'))
from group_reply import send_group_reply


class GroupReplyTest(unittest.TestCase):
    def test_passive_markdown_mentions_actual_sender_and_escapes_text(self):
        calls = []
        class Bot:
            async def send_to_group(self, **kwargs):
                calls.append(kwargs)
        event = SimpleNamespace(id='incoming-message-id', group_openid='group-A',
                                author=SimpleNamespace(member_openid='member-A'))
        for text in ['请先 @机器人 /绑定B站', '发送短弹幕：绑定389774',
                     '当前：<qqbot-at-user id="someone" />\n1. **fake**']:
            asyncio.run(send_group_reply(Bot(), event, text))
        for index, call in enumerate(calls,1):
            self.assertEqual(call['msg_id'], event.id)
            self.assertEqual(call['group_openid'], event.group_openid)
            self.assertEqual(call['msg_seq'], index)
            markdown = call['message'].data['markdown'].content
            self.assertTrue(markdown.startswith('<qqbot-at-user id="member-A" /> '))
            self.assertEqual(markdown.count('<qqbot-at-user'), 1)
        self.assertIn('绑定389774', calls[1]['message'].data['markdown'].content)


if __name__ == '__main__':
    unittest.main()
