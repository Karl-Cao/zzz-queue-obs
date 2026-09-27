# 公共 QQ 机器人服务（单实例）

这部分部署在持续在线的服务器上。所有主播共用**服务运营者的一套** QQ 官方机器人 AppID / AppSecret。主播不把自己的 AppSecret、米游社 Cookie 或 B 站登录信息发给机器人。主播电脑上的排队助手主动通过 HTTPS 长轮询连接中转服务；本地队列仍保存在主播电脑。

公开入口为 **`https://qq.zenlesszonezero.fans`**。目前由项目作者自己的 Windows 电脑和 Cloudflare Tunnel 临时托管；已验证 `/health` 可访问，`/bot/*` 无法从公网访问。电脑关机、休眠或断网时公共机器人会离线。主域名保留给项目网站。

QQ 开放平台当前的「使用范围与人员」页面提供添加到群及消息列表的二维码，允许添加最多 50 个群，限制的是群数量而非单群人数。58 人的测试群 927643163 已成功加入，机器人日志收到了 `GROUP_ADD_ROBOT` 事件。主播 QQ 可以加入消息列表开发体验用户名单；之后仍需把该主播的本地队列与目标群单独绑定。两个群的真实排队与叫号隔离尚待第二位主播安装后实测。

公共模式处理 `绑定`、`绑定群`、`/排队`。当前 Windows 托管实例还会连接本机早柚核心，将群内 `/zzz帮助` 等绝区零查询交给 ZZZeroUID；查询插件所需的美术素材须由运营者另行下载。其他公共服务部署若未设置 `PUBLIC_QQ_ENABLE_ZZZ=1` 并运行早柚核心，则只提供绑定与排队。公共查询使用运营者的早柚数据目录；正式面向多位主播开放账号绑定前，还需验证跨群数据隔离。

## 服务器准备

- Node.js 22+、Python 3.10+；安装 `pip install -r public_bot/requirements.txt`。
- 设置 `PUBLIC_QQ_APP_ID`、`PUBLIC_QQ_APP_SECRET` 和随机生成的 `PUBLIC_QQ_BOT_TOKEN`（至少 32 字符）。三者只放服务器环境或受权限保护的密钥文件，不写进仓库或发给主播。QQ 平台需要开通 **C2C 私聊**与**群聊 @机器人**消息事件。
- 运行 `node public_bot/relay-server.mjs` 和 `python public_bot/start_bot.py`，交由系统服务管理器维持运行。默认中转只监听 `127.0.0.1:8787`，机器人本身监听 `127.0.0.1:18081`。把 HTTPS 反向代理的公开入口仅转发到中转服务的 `/client/*` 和 `/health`；**不要公开 `/bot/*` 或 18081**。
- 使用 `PUBLIC_QQ_DATA_DIR` 指定持久数据目录，备份其中 `bindings.json`。单实例运行；本实现尚不支持多副本共享状态。
- `/client/register` 在服务内按来源 IP 限制为每分钟 5 次；最多允许 1000 个客户端记录。这只是开发上限，正式开放前应按预计主播数调整容量并监测磁盘、连接数和失败率。

## 当前 Windows 本机托管

QQ 群指令面板已通过 API 合并为一张「全部指令」面板，包含排队与绑定及红包申报（6项）、绝区零查询（10项）、角色攻略（1项），避免分组面板只显示最后一组。面板生成的 `/zzz角色攻略 安比` 与手输的 `zzz角色攻略 安比` 均可识别；排队和绑定也兼容开头的 `/`。带参数的指令点选后须补上昵称、游戏 UID 或角色名再发送。群内仍须真正 @机器人。面板只帮助输入口令，不代替主播群绑定或账号绑定。当前上游“角色图鉴、音擎攻略、驱动盘、突破材料、武器、邦布”均为空实现，已移出菜单，手动发送会明确提示未支持。红包申报可用 `/红包排队 金额`，金额仅在主播核对后计入，步骤见 [红包核对指南](../docs/QQ-RED-PACKET.zh-CN.md)；查询所需素材及 CK 条件仍按原插件要求。

运营者可运行 `python public_bot/sync-command-panels.py` 更新这些面板；脚本从本机凭据文件获取短期令牌，只更新以 `ZZZQueue:` 备注标识的面板，保留其他面板，并回读验证。`--validate` 只检查指令数量和文本长度，不调用 QQ。此脚本仅供服务运营者使用，不打进主播端。

本机 `runtime/cloudflared.exe` 是 [Cloudflare 官方 Windows 程序](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)，隧道 `zzz-queue-home` 已在 Cloudflare 创建；本地配置、令牌和进程记录在忽略 Git 的 `data/public-qq-host/`，隧道凭据保存在 Windows 用户的 `.cloudflared` 目录，**不要打包或分享它们**。

在作者这台临时托管电脑上，双击 `public_bot/start-host-tray.cmd` 启动黄色张嘴图标的**公共机器人托盘**。托盘菜单可刷新状态、重启中转／隧道／查询核心／机器人，以及退出并停止这些公共服务。重复启动只保留一个托盘实例。主播端的主托盘仍用原图标，退出主播端不会关闭公共机器人；公共机器人托盘退出也不会停止主播的本地队列。若托盘操作失败，查看 `data/public-qq-host/tray-error.log`。

也可以在项目目录的 PowerShell 中运行以下命令管理本机公共服务：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File public_bot/home-host.ps1 -Action StartRelay
powershell.exe -NoProfile -ExecutionPolicy Bypass -File public_bot/home-host.ps1 -Action StartBot
powershell.exe -NoProfile -ExecutionPolicy Bypass -File public_bot/home-host.ps1 -Action StopBot
powershell.exe -NoProfile -ExecutionPolicy Bypass -File public_bot/home-host.ps1 -Action Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File public_bot/home-host.ps1 -Action Stop
```

先启动中转与隧道，再启动机器人，以免同一 QQ AppID 的旧本机机器人同时连接。公共服务现在独立于本机队列模式：即使主播端未运行，其他已绑定的主播仍可使用它。本机队列若已配置公共模式，主托盘启动时会确保独立公共机器人托盘已打开；也可单独双击上述脚本。重启电脑后需启动公共机器人托盘，或启动这台机器上的主托盘。`Stop` 只结束本脚本记录且进程路径、启动时间均匹配的进程。运行日志在 `data/public-qq-host/`。这台电脑暂时是所有群的共同故障点；以后迁移到真正服务器时无需此 Windows 托盘和 Cloudflare Tunnel。

## 将来部署到 Linux 服务器（无需 Docker）

仓库中的 [`deploy/Caddyfile.example`](deploy/Caddyfile.example)、[中转 systemd 示例](deploy/zzz-public-qq-relay.service.example)、[机器人 systemd 示例](deploy/zzz-public-qq-bot.service.example) 和 [环境变量示例](deploy/env.example) 已按 `qq.zenlesszonezero.fans` 准备。路径以 `/opt/zzz-queue-obs`、持久数据目录以 `/var/lib/zzz-public-qq` 为例；若服务器布局不同，先修改示例中的路径。

1. 取得云服务器后，在域名 DNS 增加 `qq` 的 A 记录，指向该服务器公网 IPv4；有可用 IPv6 时才加 AAAA 记录。服务器只需对公网开放 80/443；8787 和 18081 保持本机监听。等待 DNS 生效，再配置 HTTPS。
2. 安装 Node.js 22+、Python 3.10+ 和 Caddy。把项目放入 `/opt/zzz-queue-obs`，创建无登录权限的 `zzzqueue` 系统用户及 `/var/lib/zzz-public-qq`，并让该用户可写持久数据目录。使用 `/opt/zzz-queue-obs/.venv` 安装 `public_bot/requirements.txt`。
3. 将 `deploy/env.example` 复制到 `/etc/zzz-public-qq.env`，填写**服务运营者**的 QQ 官方 AppID、AppSecret，并生成独立随机 `PUBLIC_QQ_BOT_TOKEN`（例如 `openssl rand -hex 32`）。密钥文件只让 root 读取，**不要提交到 Git**。把两份 `.service.example` 安装为对应的 `.service`，启用并启动中转与机器人。
4. 将 Caddy 示例中的站点块加入服务器配置，先验证配置，再重载 Caddy。它只代理 `/client/*` 与 `/health`；检查 `https://qq.zenlesszonezero.fans/health` 返回 `ok`，而 `/bot/dm` 对外返回 404。`/bot/*` 仅供同机 QQ 适配器使用。
5. 在 QQ 开放平台确认机器人有 C2C 私聊、群聊 @ 消息权限，并把这只机器人加入测试群。群管理员还需在群机器人权限中开启「允许机器人主动在群聊内发言」，否则控制台发起的群叫号会被 QQ 拒绝。最后在主播电脑控制台填写 `https://qq.zenlesszonezero.fans` 进行私聊绑定、群排队和群叫号联机测试。

正式开放前还需给 `/client/register` 加反向代理限速、设日志与数据备份，并做不同主播的真实 QQ 群隔离及断线重连测试。当前域名由作者电脑的 Cloudflare Tunnel 提供，Linux 服务器配置只是部署模板。

## 主播绑定

观众可发送 `/绑定B站 数字UID`，再用指定B站账号在本主播直播间发送5分钟验证码，验证 UID 所有权。查看或解除使用 `/查看绑定`、`/解绑B站`。QQ 成员 OpenID 与 UID 的对应关系按群隔离，舰队优先级来自主播端每分钟自动同步的本房间完整舰队名单，不依赖观众定期发弹幕。完整步骤见 [观众绑定指南](../docs/QQ-VIEWER-BINDING.zh-CN.md)。旧昵称绑定不授予舰队权益。

1. 本地助手中设置直播间 ID、数字 QQ 群号，开启「QQ 群文字排队」。在「公共 QQ 机器人」填写服务的 HTTPS 根地址，点「生成私聊绑定码」。
2. 主播私聊机器人发 `/绑定 XXXXXXXXXX`。机器人回复后，在目标群真正 `@机器人 绑定群 XXXXXXXXXX`。
3. 回本地控制台确认刚才的群 OpenID。之后群内 `@机器人 /排队` 会进入此台电脑的队列并回复名次；`@机器人 /zzz帮助` 等查询继续由公共服务处理。

绑定码 5 分钟有效，确认后即失效。一个群只能绑定一台活跃安装实例；换群需解除旧连接并重新绑定。QQ 成员 OpenID 与 B 站 UID 无法自动视作同一身份。群叫号优先匹配 QQ 入队者的 OpenID；B 站观众则用其昵称与曾 @ 过机器人的群成员昵称精确匹配，重名时只发文字。测试群 168426621 已验证主动群消息和真正的 @；其他群也需要开启主动发言权限。

主播私聊提交的是一次性**绑定码**，不是 AppID、AppSecret、B 站登录信息或米游社 Cookie。中转服务把私聊 QQ OpenID 与该安装实例关联；本机持有随机客户端令牌，并在群绑定时再次由主播确认。这样可达到“私聊绑定到本地排队助手”的目的，而不用集中收集用户凭据。

本地助手没有公网入站端口。离线或请求超时会回复“主播排队助手暂未连接/响应”，不会悄悄把旧消息留待以后加入队列。服务器仅保存绑定关系和临时投递事件；AppSecret、Cookie、队列数据不从主播电脑上传。
