"""A public group QR must never bind a different MiHoYo account."""
import runpy
import unittest
from pathlib import Path

SOURCE = (
    Path(__file__).resolve().parents[1]
    / "public_bot/core-patches/verified_game_uid.py"
)
helpers = runpy.run_path(str(SOURCE))
owns_zzz_uid = helpers["owns_zzz_uid"]
owns_game_uid = helpers["owns_game_uid"]
group_login_game = helpers["group_login_game"]


class GroupQrLoginGuardTest(unittest.TestCase):
    def test_genshin_and_zzz_roles_cannot_authorize_each_other(self):
        roles = [{"game_id": 2, "game_role_id": "102823666"}, {"game_id": 8, "game_role_id": "16270138"}]
        self.assertTrue(owns_game_uid(roles, '102823666', '2'))
        self.assertFalse(owns_game_uid(roles, '102823666', '8'))
        self.assertFalse(owns_game_uid(roles, '16270138', '2'))
        self.assertFalse(owns_game_uid(roles, '999999999', '2'))
        self.assertEqual(group_login_game('ys扫码登录'), ('2', '原神', 'ys', 0))
        self.assertEqual(group_login_game('扫码登录'), ('8', '绝区零', 'zzz', 2))

    def test_accepts_only_matching_zzz_role(self):
        roles = [
            {"game_id": 2, "game_role_id": "16270138"},
            {"game_id": 8, "game_role_id": "12345678"},
        ]
        self.assertTrue(owns_zzz_uid(roles, "12345678"))
        self.assertFalse(owns_zzz_uid(roles, "16270138"))
        self.assertFalse(owns_zzz_uid(roles, "87654321"))

    def test_rejects_failed_or_malformed_role_response(self):
        for roles in (None, -100, {}, [{"game_id": 8}], ["12345678"]):
            self.assertFalse(owns_zzz_uid(roles, "12345678"))
