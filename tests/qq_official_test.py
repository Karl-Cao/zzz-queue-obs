"""Offline smoke test for the official QQ group-message adapter."""

import asyncio
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

import nonebot

nonebot.init()
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "qq"))
import official_queue  # noqa: E402
from nonebot.adapters.qq.event import GroupAtMessageCreateEvent  # noqa: E402


class FakeBot:
    def __init__(self):
        self.sent = []

    async def send(self, event, message):
        self.sent.append(message)


class QQOfficialTest(unittest.TestCase):
    def test_group_mention_joins_only_allowed_group(self):
        with tempfile.TemporaryDirectory() as folder:
            config = Path(folder) / "settings.json"
            config.write_text(json.dumps({"group_id": "168426621", "group_openid": "group-open-id", "token": "local-test", "queue_url": "http://127.0.0.1:3668/api/qq/message"}), encoding="utf-8")
            original_config, original_observed, original_post = official_queue.CONFIG, official_queue.OBSERVED, official_queue._post
            requests = []

            def fake_post(url, token, payload):
                requests.append((url, token, payload))
                return {"queued": True, "position": 2}

            official_queue.CONFIG = config
            official_queue.OBSERVED = Path(folder) / "official-groups.json"
            official_queue._post = fake_post
            bot = FakeBot()
            try:
                event = GroupAtMessageCreateEvent.model_validate({
                    "id": "ROBOT1." + "a" * 100 + "." + "b" * 100, "content": "排队", "timestamp": "2026-09-24T20:00:00+08:00",
                    "group_id": "168426621", "group_openid": "group-open-id",
                    "author": {"id": "opaque-id", "bot": False, "member_openid": "member-open-id", "member_role": "member", "username": "测试观众"},
                })
                asyncio.run(official_queue.join_queue(bot, event))
                self.assertEqual(len(requests), 1)
                self.assertEqual(requests[0][2]["userId"], "member-open-id")
                self.assertEqual(requests[0][2]["name"], "测试观众")
                self.assertEqual(len(requests[0][2]["messageId"]), 64)
                self.assertEqual(bot.sent, ["已在排队列表，第 2 位。"])
                other = event.model_copy(update={"group_openid": "other-group-open-id"})
                asyncio.run(official_queue.join_queue(bot, other))
                self.assertEqual(len(requests), 1)
            finally:
                official_queue.CONFIG = original_config
                official_queue.OBSERVED = original_observed
                official_queue._post = original_post


if __name__ == "__main__":
    unittest.main()
