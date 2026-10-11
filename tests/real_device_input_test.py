import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from real_device_input import validate_device_input


class RealDeviceInputTest(unittest.TestCase):
    def setUp(self):self.data={'uid':'102823666','fp':'abcdef1234567','device_id':'12345678-1234-1234-1234-123456789abc'}
    def test_accepts_exact_device_values(self):
        self.assertEqual(validate_device_input(self.data,'102823666'),self.data)
    def test_rejects_wrong_uid_and_credentials(self):
        with self.assertRaises(ValueError):validate_device_input(self.data,'100000000')
        for key in ['cookie','stoken','authorization']:
            with self.assertRaises(ValueError):validate_device_input({**self.data,key:'DO-NOT-IMPORT'},'102823666')
    def test_rejects_incomplete_values_and_header_injection(self):
        for value in ['', 'not a device id', '12345678\r\nCookie:secret']:
            with self.assertRaises(ValueError):validate_device_input({**self.data,'device_id':value},'102823666')
        with self.assertRaises(ValueError):validate_device_input({**self.data,'device_info':'iPhone/iOS'},'102823666')
