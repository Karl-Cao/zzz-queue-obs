# ZZZ Queue v1.13.1

## 简体中文

- 新增群内 `@机器人 /排队列表`：显示当前叫号观众、等待人数和前20位等待观众，包含金额及红包待核对状态；顺序与OBS挂件一致，查询不改变队列。未绑定B站的群成员也可查看；入队和红包申报仍需验证。
- 排队和B站绑定等回复使用真正的QQ @提及。此修复由服务器提供，旧主播端同样受益。
- 更新新手指南及中英文说明：公共机器人已迁移至云服务器；绝区零查询授权请用 `/zzz扫码登录`。原神、英雄联盟及PUBG入口由服务器提供，主播安装包不包含这些服务或贴图。
- 已检查ZZZeroUID上游并在服务器应用 `0cd503e` 的单文件兑换码修复：识别新前瞻入口、完整显示多条兑换码。保留现有服务器补丁和数据；主播端无需为此更新。

**升级：**退出旧版，解压新版到新目录，将旧版完整 `data` 文件夹复制到新版目录，再启动。无需重新绑定QQ群或观众B站账号；不要同时运行新旧两份。`/排队列表` 需要主播端更新到1.13.1，旧客户端会收到升级提示。

**下载：**Windows x64 EXE版无需安装Python，运行 `ZZZ Queue.exe` 或 `start.cmd`；Python版需Python 3.10+，运行 `start-python.cmd`。两个包均只含主播端，无需Docker、机器人密钥或本地查询服务器。附SHA-256校验文件；GitHub自动生成的Source code不是安装包。

[新手手册](https://github.com/Karl-Cao/zzz-queue-obs/blob/v1.13.1/docs/USER-GUIDE.zh-CN.md) · [更新范围](https://github.com/Karl-Cao/zzz-queue-obs/blob/v1.13.1/docs/UPDATE-SCOPE.zh-CN.md)

## English

- Adds `@bot /排队列表` to display the current viewer, waiting count and first 20 waiting viewers, including amounts and pending red-packet claims. It uses the OBS widget order without changing the queue. Viewing does not require Bilibili verification; joining and payment claims still do.
- Queue and Bilibili-linking replies now use genuine QQ mentions. This server-side fix also benefits existing streamer clients.
- Updated setup documentation for the cloud-hosted public bot and `/zzz扫码登录` authorization. Additional game queries run on the server and are excluded from the streamer packages.
- Applied the reviewed ZZZeroUID upstream `0cd503e` redemption-code fix on the server, preserving existing patches and account data.

**Upgrade:** exit the old app, extract the new version, copy the entire old `data` folder into it, then launch. Group and viewer bindings remain intact. Do not run both installations. The new queue-list command requires the 1.13.1 streamer client; server-only changes do not.

Windows x64 EXE and Python editions include only the streamer client. Python users need Python 3.10+. SHA-256 checksum files are included. GitHub Source code archives are not installers.

Validation: 91 Node tests, 85 Python tests, both package startup checks, and EXE/Python tray start/restart/stop checks. Live QQ reply appearance remains subject to client-side manual acceptance.
