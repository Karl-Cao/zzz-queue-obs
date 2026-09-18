# ZZZ Queue OBS · 绳匠委托终端

[English](README.en.md) | 简体中文

面向 Bilibili 直播的排队、抽奖、手动叫号与桌面穿透弹幕工具。Windows 便携版；无需 Docker。独立项目，非米哈游、LAPLACE 或 OBS 官方产品。

## 下载安装

到 [Releases](https://github.com/Karl-Cao/zzz-queue-obs/releases/latest) 下载 `obs-queue-*-windows-x64.zip`，解压到可写文件夹。不要下载 GitHub 自动生成的 Source code ZIP 作为安装包。

- `start.cmd`：启动服务与控制台，右上角切换中文 / English。
- `desktop.cmd`：中文桌面穿透窗；`desktop-en.cmd`：英文桌面穿透窗。
- `stop.cmd`：停止此安装目录的服务。
- `enable-lan.cmd`：允许同一局域网的手机 / 平板访问；需要 Windows 管理员授权。

支持 Windows 10/11 x64。已包含 Node.js 22 和 Event Bridge。桌面窗使用 Windows .NET Framework，TTS 使用 Windows 已安装的语音。首次运行未签名程序时 Windows 可能提示来源未知；可对照 Release 的 SHA-256 校验值核对下载。

## 连接 LAPLACE

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
- OBS 排队：`http://127.0.0.1:实际端口/overlay?lang=zh`（英文使用 `lang=en`）。建议 560 × 900。
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
powershell -ExecutionPolicy Bypass -File scripts/fetch-dependencies.ps1
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1
```

构建下载固定版本官方依赖并校验 SHA-256。产物位于 `releases/`，包含依赖许可证及 Event Bridge 对应源码。应用代码采用 MIT；第三方组件见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
