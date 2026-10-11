import asyncio
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'public_bot'))
from wegame_login import WeGameSession, account_number, allowed_jump, parse_status, qr_token
import httpx


class WeGameInputTest(unittest.TestCase):
    def test_status_parser_does_not_execute_callback(self):
        self.assertEqual(parse_status("ptuiCB('66','0','','0','waiting');")[0], '66')
        self.assertEqual(parse_status("ptuiCB('0','0','https://ptlogin2.qq.com/check_sig?a=b','0','OK','name');")[2],
                         'https://ptlogin2.qq.com/check_sig?a=b')
        for raw in ('alert(1)', "ptuiCB('999','0','','0','oops');"):
            with self.assertRaises(ValueError):
                parse_status(raw)

    def test_account_and_redirect_validation(self):
        self.assertEqual(account_number('o00123456789'), '123456789')
        for raw in ('', 'openid', '123', '12;secret'):
            with self.assertRaises(ValueError): account_number(raw)
        self.assertTrue(allowed_jump('https://ptlogin2.wegame.com.cn/check_sig?x=1'))
        for url in ('http://ptlogin2.qq.com/check_sig', 'https://evil.example/qq.com',
                    'https://user@ptlogin2.qq.com/check_sig', 'https://127.0.0.1/secret'):
            self.assertFalse(allowed_jump(url))
        self.assertEqual(qr_token('abc'), 108966)


class WeGameSessionTest(unittest.IsolatedAsyncioTestCase):
    async def test_mismatched_scanner_never_reaches_credential_exchange(self):
        session = WeGameSession('123456789')
        await session.client.aclose()
        seen = []
        def response(request):
            seen.append(str(request.url))
            return httpx.Response(200, headers=[('Set-Cookie', 'uin=o00987654321; Path=/')])
        session.client = httpx.AsyncClient(transport=httpx.MockTransport(response))
        try:
            with self.assertRaises(PermissionError):
                await session.exchange('https://ptlogin2.qq.com/check_sig?test=1')
            self.assertEqual(len(seen), 1)
        finally:
            await session.close()

    async def test_success_keeps_only_query_credentials(self):
        session = WeGameSession('123456789')
        await session.client.aclose()
        def response(request):
            if request.method == 'GET':
                return httpx.Response(200, headers=[('Set-Cookie','uin=o00123456789; Path=/'),
                    ('Set-Cookie','skey=test; Path=/'), ('Set-Cookie','p_skey=test; Path=/')])
            return httpx.Response(200, headers=[('Set-Cookie','tgp_ticket=ticket; Path=/'),
                ('Set-Cookie','tgp_id=1; Path=/'), ('Set-Cookie','unrelated=private; Path=/')])
        session.client = httpx.AsyncClient(transport=httpx.MockTransport(response))
        try:
            result = await session.exchange('https://ptlogin2.qq.com/check_sig')
            self.assertEqual(result['tgp_id'], '1')
            self.assertNotIn('unrelated', result)
        finally:
            await session.close()


if __name__ == '__main__': unittest.main()
