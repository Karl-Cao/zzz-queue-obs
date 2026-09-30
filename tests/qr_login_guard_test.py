"""A public group QR must never bind a different MiHoYo account."""
import runpy
import unittest
from pathlib import Path

SOURCE = (
    Path(__file__).resolve().parents[1]
    / "public_bot/core-patches/verified_game_uid.py"
)
owns_zzz_uid = runpy.run_path(str(SOURCE))["owns_zzz_uid"]


class GroupQrLoginGuardTest(unittest.TestCase):
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
