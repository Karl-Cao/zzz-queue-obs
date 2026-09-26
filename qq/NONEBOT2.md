# 使用 NoneBot2 接入 QQ

本方案有四段连接：备用 QQ 账号登录 NapCat → NapCat 把 OneBot V11 群消息送给 NoneBot2 → NoneBot2 的 GenshinUID 连接器送给早柚核心 → `gsuid_queue` 把「排队」送给本地排队程序。每段都需要独立运行；不需要 Docker。已在真实 QQ 群验证文字「排队」进入现有队列、同名合并及再次发送不重置等待时间。

1. **准备 QQ 账号。** 用备用 QQ 号登录并加入你要使用的 QQ 群。群主需要允许该账号入群。登录、二维码和验证都由账号持有人在 QQ/NapCat 本地完成；不要把密码或验证码写入配置文件或发给他人。此方案不要求注册 QQ 开放平台机器人。
2. **安装 QQ 协议端。** Windows 用户下载 [NapCatQQ Desktop 官方发行页](https://github.com/NapNeko/NapCatQQ-Desktop/releases)中的 `NapCatQQ-Desktop-*-x64.msi`；`watch-v` 不是桌面安装包。在管理器中为备用 QQ 建立本地 Bot，并按引导安装兼容的 QQ/NapCat。不要覆盖正在使用的主播 QQ。NapCat [官方发行说明](https://github.com/NapNeko/NapCatQQ/releases)要求 QQ 至少为 40768 版本。在 NapCat 本地 WebUI 建立 OneBot V11 **反向 WebSocket**，目标地址为 `ws://127.0.0.1:<NoneBot端口>/onebot/v11/ws`（本机示例端口为 `18080`）。设置独立的访问令牌，并在 NoneBot2 中使用相同令牌。保持此连接仅在本机。连接地址见 [NoneBot OneBot 适配器文档](https://onebot.adapters.nonebot.dev/docs/guide/setup/)。
3. **安装 NoneBot2。** 按 [官方创建项目指南](https://cli.nonebot.dev/docs/guide/create-a-project/)建立 Python 虚拟环境和 bootstrap 项目，选择 FastAPI 驱动器并安装 `nonebot-adapter-onebot`。在项目目录执行 `nb adapter install nonebot-adapter-onebot`。配置 `HOST=127.0.0.1`、`PORT` 为未占用端口（本机使用 `18080`）、`ONEBOT_ACCESS_TOKEN` 为上一步的令牌。将**主播自己的 QQ 号**填入 `SUPERUSERS=["主播QQ号"]`，不要填机器人号。先运行 `nb run`，确认日志显示 OneBot V11 账号上线。

   将本仓库的 [`mention_gate.py`](mention_gate.py) 复制到 NoneBot2 项目 `bot.py` 同目录，并在 `nonebot.init()` 之后、加载 `GenshinUID` 之前加上 `import mention_gate`。该门禁只让以 QQ 真正的 `@机器人` 开头的**群消息**进入早柚核心；私聊保持原样。不要仅键入昵称文本。
4. **连接早柚核心。** 按 [早柚核心安装指南](https://docs.sayu-bot.com/Started/InstallCore.html)单独安装并启动 gsuid_core，在 NoneBot2 项目执行 `nb plugin install nonebot-plugin-genshinuid`。该连接器会把 NoneBot2 消息送到早柚核心。两者都在本机时按[官方连接说明](https://docs.sayu-bot.com/LinkBots/NoneBot2)配置；`gsuid_core_port` 必须与早柚核心实际监听端口一致。先用主播账号给机器人发 `core状态`，确认有回复。
5. **装功能插件。** 将本仓库 `qq/gsuid_queue` 复制到早柚核心源码的 `gsuid_core/plugins` 目录，按 [README](README.md)填写 `settings.json`。如需绝区零 UID 绑定和角色查询，再按 [ZZZeroUID 官方说明](https://github.com/ZZZure/ZZZeroUID)安装它；它与 QQ 排队是两项独立功能。

   本机测试 ZZZeroUID 3.3.3 时，Enka 公开角色数据与插件自带映射的字段名称不一致，导致 `zzz刷新面板` 回退到米游社并可能遇到 `-999`。本仓库保存了已验证的 [本地兼容补丁](patches/ZZZeroUID-enka-3.3.3.patch)。安装**同一版本**的 ZZZeroUID 后，在插件仓库目录执行 `git apply <本仓库路径>/qq/patches/ZZZeroUID-enka-3.3.3.patch` 并重启早柚核心。后续升级 ZZZeroUID 时先核对上游是否已修复，不要对其它版本直接套用。

   测试指令：`zzz帮助`、`zzz绑定UID<游戏UID>`、`zzz刷新面板`、`zzz练度统计`。后两项可使用 Enka 的公开展示角色；`zzz查询` 和 `zzz深渊` 会请求米游社接口，需要 Cookie。若同时看到两次 `[mys_request] 请求连接错误...` 和 `-999`，应先检查早柚核心能否联网：核心在两次连接失败后也会返回 `-999`，其通用提示会误写成“出现验证码”。连接正常时的 `-999` 才需继续排查验证码风控。单发 `绑定设备` 不会完成绑定；[早柚官方设备绑定说明](https://docs.sayu-bot.com/Advance/BindDevice)要求私聊机器人发送 `mys设备登录` 加实际设备信息，且其常规工具仅支持 Android。不要在群内发送 Cookie 或设备信息。
6. **端到端测试。** 启动顺序建议为排队程序、早柚核心、NoneBot2、NapCat。在指定群发送 `@机器人 排队`，确认机器人回复排位且 OBS 队列出现该昵称；发送不带 @ 的 `排队` 应无回复且不入队。再用 `@机器人 zzz帮助` 与 `@机器人 zzz查询安比` 检查绝区零指令。从错误群发送带 @ 的排队指令仍不能入队。私聊扫码登录不需要 @。

**重启电脑后。** 排队程序、早柚核心和 NoneBot2 是三个独立进程；只启动 NapCat 不会自动启动另外三者。本机可运行 [`start-local-stack.ps1`](start-local-stack.ps1) 恢复它们。该脚本使用本仓库的 Python 虚拟环境，启动托盘、早柚核心（8765）和 NoneBot2（18080），已运行的服务不会重复启动。NapCat Desktop 仍须登录机器人并启用反向 WebSocket。若要随 Windows 登录自动启动，可将 `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "<仓库绝对路径>\qq\start-local-stack.ps1"` 加入当前用户的启动项；移动仓库后需更新该路径。启动错误可查看 `data/qq-runtime/startup-logs/`。

QQ 红包金额尚未接入。即使红包只指定一位成员，也要先确认 NapCat/OneBot 实际事件是否提供了可验证的金额，才可给队列加钱。
