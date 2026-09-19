# ZZZ Queue OBS · 绳匠委托终端

[English](README.en.md) | 简体中文

**第一次使用？请阅读 [新手详细操作手册](docs/USER-GUIDE.zh-CN.md)。** 包含 LAPLACE Chat、OBS、单屏方案、手机遥控、排队、抽奖、语音和常见问题。也可从 Releases 下载 `USER-GUIDE.zh-CN.html`，双击离线阅读或打印。

面向 Bilibili 直播的排队、抽奖、手动叫号与桌面穿透弹幕工具。Windows 便携版；无需 Docker。独立项目，非米哈游、LAPLACE 或 OBS 官方产品。

## 下载安装

到 [Releases](https://github.com/Karl-Cao/zzz-queue-obs/releases/latest) 选择一个版本，完整解压到可写文件夹。不要下载 GitHub 自动生成的 Source code ZIP 作为安装包。

- **EXE 版（推荐）**：下载 `obs-queue-*-windows-x64-exe.zip`，运行 `ZZZ Queue.exe` 或 `start.cmd`。无需安装 Python。请保留整个解压目录，不能只复制 EXE。
- **Python 版**：下载 `obs-queue-*-windows-x64-python.zip`，安装 Python 3.10+ 后运行 `start-python.cmd`。首次联网安装托盘依赖到本目录 `.venv/`，随后使用 `queue_tray.py` 启动。同样包含 Node.js 和 Event Bridge；这是 Python 托盘启动器版，排队服务仍使用 Node.js。

两个版本启动后都独立常驻右下角托盘，无需开启悬浮窗。点击图标打开管理控制台；右键可打开直播面板、OBS 挂件、桌面悬浮窗，重启服务，切换中英文或退出并停止服务。退出会关闭本版本桌面窗，并停止此服务自己启动的桥接；不会关闭外部共享桥接。图标可能被 Windows 收入托盘的展开菜单。

- `start.cmd`：启动主托盘与控制台，右上角切换中文 / English。
- `desktop.cmd`：中文桌面穿透窗；`desktop-en.cmd`：英文桌面穿透窗。
- `stop.cmd`：停止此安装目录的服务。
- `enable-lan.cmd`：允许同一局域网的手机 / 平板访问；需要 Windows 管理员授权。

支持 Windows 10/11 x64。已包含 Node.js 22 和 Event Bridge。桌面窗使用 Windows .NET Framework，TTS 使用 Windows 已安装的语音。首次运行未签名程序时 Windows 可能提示来源未知；可对照 Release 的 SHA-256 校验值核对下载。

## 连接 LAPLACE

### 启动与重启保障

同一安装目录的并发启动会串行处理，重复打开主程序会唤起已有托盘的控制台。`ZZZ Queue.exe --restart` 或 `python queue_tray.py --restart` 可向已运行的托盘发送重启请求。重启会先等旧服务退出再启动，保留已分配端口；默认端口被其他程序占用时首次启动自动换端口。慢电脑最多等待 90 秒启动。托盘分别检查服务、网页和桥接状态；桥接已连接仍不等于收到真实弹幕。

卡死服务优先正常关闭，必要时只清理同时匹配 Node 可执行文件和本安装目录入口路径的进程树。不要同时从多个安装目录运行插件；不同目录的数据互不共享。

1. 控制台保存 Bilibili 直播间 ID。默认桥接地址 `ws://127.0.0.1:9696`，助手自动启动本机桥接。
2. LAPLACE 控制台右上角齿轮 → 向下滚动到 Event Bridge → 开启。填写与本工具相同的地址、令牌。没有配置令牌时，两端都留空。
3. 发一条真实弹幕，确认本工具事件计数增加。桥接“已连接”本身不保证 LAPLACE 正在提供事件。

连接链路：LAPLACE 控制台 → Event Bridge → 本工具。使用具备可靠观众 UID 的 LAPLACE 连接方式；匿名连接可能屏蔽真实身份。保留本机地址绑定，不要把无认证桥接暴露到公网。

单屏用户可在 OBS 浏览器源内加载 `https://chat.laplace.live/dashboard/房间号`，用“交互”配置桥接；保持源在活动场景，放在游戏捕获下，关闭“不可见时关闭源”。OBS 控制台的配置与普通浏览器不共享。已做短时后台转发测试，长时直播仍应按实际设备验证。

## 当前与接下来

- 弹幕排队、有效礼物和抽奖中奖只进入“接下来”，不触发叫号。
- 点击 **完成当前叫号并继续**：将当前观众记入完成历史，把等待队列第一位转为当前，并播报一次。等待队列为空时只完成当前，不播报。
- **重播当前叫号**只播当前观众；不会推进队列。
- 礼物金额累计只排序等待队列，同额先到先排。中奖者固定在等待队列前方；新中奖者排在旧中奖者前。不影响当前观众。
- 当前观众的重复排队 / 礼物事件不会让其同时出现在等待队列。完成后可重新参加。
- 免费排队可关闭，此时需至少 0.1 元且达到门槛的单次付费礼物。低于门槛的礼物和银瓜子不计；抽奖参与不受免费排队开关限制。
- 抽奖礼物只按名称匹配，同名不同 ID 都有效；不展示房间礼物图鉴。

手动叫号减少进队时与弹幕 TTS 同时触发的情况，但不能保证与独立的 LAPLACE 语音自动互斥。LAPLACE 弹幕播报仍需在其自身设置中控制。

## 桌面、OBS 与手机

- 桌面：Ctrl+Alt+Q 切换穿透 / 操作；Ctrl+Alt+H 显示 / 隐藏；操作模式拖动标题移动，托盘菜单可退出。建议无边框窗口游戏；独占全屏可能遮挡桌面窗。
- OBS 排队：`http://127.0.0.1:实际端口/overlay?lang=zh`（英文使用 `lang=en`）。建议 360 × 400。
- OBS 弹幕：`http://127.0.0.1:实际端口/chat-overlay?lang=zh`。设置中开启“在 OBS 弹幕源中展示聊天”后才输出；默认关闭。桌面与手机仍可看弹幕。
- 若只想自己看桌面窗，注意“显示器捕获”可能把它录入；使用游戏捕获并检查预览。
- 手机和平板使用控制台自动识别的局域网地址，输入电脑上显示的八位配对码。会话有效期 12 小时。

## 语音和数据

开启“电脑后台 TTS”，并在设置选择叫号语音语言。Windows 后台语音不依赖浏览器是否可见；OBS 需采集正确的音频设备。手机通常不需要同时启用设备 TTS。

`data/` 保存设置和队列。升级：先退出悬浮窗并停止旧版本，解压新包，复制旧 `data/` 到新目录后启动。旧版本队列整体保留为“接下来”，不会自动设为当前或触发播报。桥接 9698 的旧配置继续支持自动启动；新安装默认 9696。不要公开上传 `data/`、令牌或 OBS 登录链接。

## 开发与构建

Node.js 22+，零生产 npm 依赖：

```powershell
npm test
python tests/tray_test.py
python -m pip install -r requirements-build.txt
powershell -ExecutionPolicy Bypass -File scripts/fetch-dependencies.ps1
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1
```

构建下载固定版本官方依赖并校验 SHA-256。产物位于 `releases/`，包含依赖许可证及 Event Bridge 对应源码。应用代码采用 MIT；第三方组件见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

OBS 排队挂件适配 360×400；在“连接与规则”选择自动翻页（4 人 / 6 秒）或自动滚动。当前观众始终固定，全部等待观众轮流显示。
