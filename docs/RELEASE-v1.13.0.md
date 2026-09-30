# ZZZ Queue v1.13.0

## 简体中文

- 新增游戏登录二维码分享：在控制台配置 OBS 游戏来源与二维码区域，叫号时向绑定QQ群发送真实游戏客户端登录码；支持只预览的识别测试和不推进队列的重发。
- 已人工验收：OBS 获取二维码、QQ 群显示图片、米游社扫码后电脑端绝区零登录成功。兼容真实游戏码的 `qr_code_in_game.html` 地址。
- 识别失败或队列变化时不推进；群图片发送失败后保留当前任务。重发不重复本地语音，二维码不保存到磁盘。
- 合并此前测试版修复：QQ↔B站验证身份保存在本机 data，自动回复验证成功；主播私聊绑定/解绑群；弹幕和 QQ 取消排队；指定叫号后追加礼物及红包待核对显示；控制台和挂件只标记未绑定观众。
- 提供 Windows x64 EXE 和 Python 两版，仅包含主播端；无需 Docker、机器人密钥或本地查询服务器。

**升级：**退出旧版，解压新版，将旧版完整 `data` 文件夹复制到新版目录，再启动。不要覆盖正在运行的安装或同时运行两份。EXE 版运行 `ZZZ Queue.exe` / `start.cmd`；Python 版需 Python 3.10+，运行 `start-python.cmd`。

**首次配置：**启用 OBS WebSocket，保留身份验证；在控制台「游戏登录二维码」选择来源、获取画面、框选并保存，先测试识别。游戏需保持扫码登录界面；每次发送前刷新游戏码。二维码对所有群成员可见，请标注的本人扫码。它与查询 Cookie 的 `/扫码登录` 相互独立。

详见 [中文游戏码指南](https://github.com/Karl-Cao/zzz-queue-obs/blob/v1.13.0/docs/GAME-LOGIN-QR.zh-CN.md) 和 [新手完整手册](https://github.com/Karl-Cao/zzz-queue-obs/blob/v1.13.0/docs/USER-GUIDE.zh-CN.md)。公共测试机器人由作者电脑托管，电脑离线时 QQ 功能暂停；本地排队继续可用。

## English

- Share the real ZZZ PC login QR from a configured OBS source when calling the next viewer. Includes detection-only previews and resending without advancing the queue or repeating local voice.
- Manually verified real OBS capture, visible QQ image delivery, and successful PC game login after scanning with MiYouShe. QR detection and queue-change failures prevent advancement; failed image delivery preserves the current task.
- Includes persistent QQ/Bilibili verification, automatic verification replies, private group management, viewer cancellation, returned-viewer gift/red-packet fixes, and unbound viewer badges.
- Windows x64 EXE and Python editions contain only the streamer client, without Docker or bot-server credentials.

**Upgrade:** exit the old app, extract the new package, copy the entire old `data` folder into it, then launch. Do not run both installations. EXE users run `ZZZ Queue.exe` or `start.cmd`; Python users need Python 3.10+ and run `start-python.cmd`.

Configure OBS WebSocket, the game source and QR crop in the dashboard, then test detection first. Refresh the game QR before sending. All group members can see the QR; only the named viewer should scan. The public test bot is hosted on the author's PC and is unavailable when that PC is offline. See the [English setup guide](https://github.com/Karl-Cao/zzz-queue-obs/blob/v1.13.0/docs/GAME-LOGIN-QR.en.md).

Validation: 88 Node tests, 7 Python tests, both package server startup checks, EXE/Python launcher lifecycle checks, and manual game-login acceptance. Archives include SHA-256 checksum files. User data and live QR images are excluded.
