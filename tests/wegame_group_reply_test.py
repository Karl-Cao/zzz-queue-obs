import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'public_bot'))
from wegame_login import WeGameGroupLogin


class WeGameReplyTest(unittest.IsolatedAsyncioTestCase):
    async def test_qr_is_one_message_with_no_separate_notice(self):
        session=SimpleNamespace(create=AsyncMock(return_value=b'qr-image'),wait=AsyncMock(side_effect=TimeoutError),close=AsyncMock())
        bot=SimpleNamespace(send=AsyncMock())
        event=SimpleNamespace(author=SimpleNamespace(member_openid='testmember123'))
        with patch('wegame_login.WeGameSession',return_value=session):
            await WeGameGroupLogin('http://127.0.0.1/unused','unused').run(bot,event,'lol扫码登录 123456789')
        calls=bot.send.call_args_list
        self.assertEqual(len(calls),2) # QR followed by timeout, no extra QR reminder.
        qr=calls[0].args[1]
        self.assertTrue(any(s.type in ('image','file_image') for s in qr))
        text=''.join(str(s.data) for s in qr)
        self.assertIn('6789',text)
        self.assertNotIn('图片编号',text)
        self.assertNotIn('上方',text)
        session.close.assert_awaited_once()
