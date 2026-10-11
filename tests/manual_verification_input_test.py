import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from manual_verification_input import verification_body

class VerificationInputTest(unittest.TestCase):
    def test_preserves_sdk_result_after_checking_session(self):
        original='a'*32
        values={'geetest_challenge':original+'ab','geetest_validate':'b'*32,'geetest_seccode':'b'*32+'|jordan'}
        body=verification_body(original,values)
        self.assertEqual(body['geetest_challenge'],values['geetest_challenge'])
        self.assertEqual(body['geetest_seccode'],values['geetest_seccode'])

    def test_rejects_other_session_and_tampered_result(self):
        values={'geetest_challenge':'a'*32,'geetest_validate':'b'*32,'geetest_seccode':'b'*32+'|jordan'}
        for override in [{'geetest_challenge':'c'*32},{'geetest_seccode':'wrong'},{'geetest_validate':'invalid\r\nheader'}]:
            with self.assertRaises(ValueError):verification_body('a'*32,{**values,**override})

if __name__=='__main__':unittest.main()
