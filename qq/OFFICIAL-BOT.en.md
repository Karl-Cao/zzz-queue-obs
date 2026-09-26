# Official QQ bot setup

[简体中文](OFFICIAL-BOT.md)

The queue assistant can use a QQ Open Platform bot for group `@bot 排队` messages. The Windows package includes gsuid_core and ZZZeroUID for Zenless Zone Zero queries. This mode does not require NapCat, Docker, or a second personal QQ account.

QQ Open Platform's recommended connection guide lists WorkBuddy, OpenClaw, Hermes, QClaw, LightVela, and other bot services. Those are alternative integrations. This assistant connects directly using the [NoneBot2 QQ adapter](https://github.com/nonebot/adapter-qq); do not connect the same bot to a second Agent service at the same time. Group event permissions and a live connection test are still required.

1. Create an official bot on QQ Open Platform. In Development Settings, find **AppID** and **AppSecret**. Enable group @mention message events and add the bot to the target group. Keep AppSecret private.
2. On the streaming PC, open the queue dashboard. Under Connection and Rules, enter the numeric QQ group number, enable QQ group queue, and save. Enable free queue if ordinary group members should join by text alone.
3. In “Official QQ bot · ZZZ queries,” enter AppID and AppSecret and save. Click **Start QQ services**. If a legacy NapCat bot is already running, click **Restart QQ bot** to switch modes. Credentials are stored in this installation's `data/qq-runtime/official-bot.json` and are never echoed in the dashboard.
4. Wait for “Official QQ bot connected.” In the target group, use QQ's real @mention picker to send `@bot 排队` once. The first message identifies the group's OpenID and may not receive a reply. Back in the dashboard, click **Refresh observed QQ groups**, then **Bind this group** for the group you just tested.
5. Send `@bot 排队` again and confirm the rank reply. Then try `@bot zzz帮助`. Typing the bot's nickname without selecting an @mention will not work.

Large ZZZ art and guide images are **not included** in the installer. Before using image queries, double-click `下载绝区零素材.cmd` in the extracted folder and let it finish. Files go to `data/qq-runtime/gsuid_core/data/ZZZeroUID/`; keep `data/` when upgrading. The download may be large and can be retried. Bot startup does not automatically fetch the full art library. Queue commands work without it, but some image queries may be incomplete.

After first-time setup, starting the queue assistant also starts its QQ services. The tray Restart action checks them again, and Exit stops QQ processes started by this installation. Processes started by another installation are left alone.

The official QQ event provides a member OpenID rather than a numeric QQ account ID, and a separate OpenID for the group. The assistant displays the event's nickname when available and applies its existing same-name merge rule; otherwise it displays `QQ用户` plus an OpenID prefix. QQ red-packet amounts are not supported yet. Some HoYoverse queries require separate Cookie binding and may be blocked by a verification challenge. Do not send Cookie or device details in the group.

If the bot is in the group but does not reply, check event permission, the saved group number, the free-queue toggle, and local connection status. Startup logs are under `data/qq-runtime/startup-logs`; review them for account details before sharing. Existing NapCat users can follow [the legacy guide](NONEBOT2.md).
