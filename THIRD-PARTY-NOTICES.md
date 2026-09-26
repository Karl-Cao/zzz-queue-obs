# Third-party components

## Node.js 22.23.2

Official distribution: https://nodejs.org/dist/v22.23.2/

The Windows x64 portable packages include the unmodified node.exe and its full LICENSE document under licenses/Node.js-LICENSE.txt. That document includes Node.js and bundled component notices.

Archive SHA-256: 1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97

## LAPLACE Event Bridge 0.3.20

Upstream: https://github.com/laplace-live/event-bridge

Release tag: @laplace.live/event-bridge-server@0.3.20

The unmodified standalone server executable is included under vendor/. Its license is AGPL-3.0; the full license and upstream build README are included under licenses/. Corresponding source for the exact release is supplied in third-party-source/laplace-event-bridge-0.3.20-source.zip, including its module and toolchain build definitions. This application communicates with the separate server over WebSocket.

Executable SHA-256: 759d6a64497391594e10a27692f2f37221bd96103d84c427a789dbcff0227012

This is an independent queue tool and not an official LAPLACE or OBS product.

## Optional QQ bot bundle

Both Windows packages include a portable Python runtime and the following independent components for QQ group messages and ZZZ queries:

- [gsuid_core](https://github.com/Genshin-bots/gsuid_core), GPL-3.0; its Python source is under `qq/runtime/source/gsuid_core/`, with its license under `qq/runtime/licenses/`.
- [ZZZeroUID](https://github.com/ZZZure/ZZZeroUID), AGPL-3.0; its Python source is under `qq/runtime/source/gsuid_core/plugins/ZZZeroUID/`, with its license under `qq/runtime/licenses/`.
- [NoneBot QQ adapter](https://github.com/nonebot/adapter-qq), MIT; the installed Python package and metadata are under `qq/runtime/nonebot-venv/Lib/site-packages/`, with its license under `qq/runtime/licenses/`.
- [NoneBot GenshinUID connector](https://github.com/Genshin-bots/nonebot-plugin-genshinuid), GPL-3.0-or-later, and its dependencies are included in that same portable environment; its license is also copied under `qq/runtime/licenses/`.

QQ AppSecret, account Cookie, group settings and chat logs are user data. They are created under `data/` after extraction and are not included in the release archive. Large upstream ZZZ art and guide images are excluded; users download them separately into `data/` when needed. The bundled gsuid_core and ZZZeroUID source is patched to keep runtime data under `data/` and skip automatic full-resource downloads. QQ Open Platform and HoYoverse account services remain external services.

## Windows tray launcher

The EXE edition additionally bundles Python 3.13 and the pystray, Pillow and six packages, built with PyInstaller. Their license documents (including Pillow's bundled-library notices and the PyInstaller bootloader exception) are included under licenses/. The Python edition installs the pinned dependencies listed in requirements.txt.

The application icon in assets/ is the image supplied by the project owner, converted to Windows ICO sizes without redrawing. It is not covered by the application's MIT source-code license; underlying artwork rights remain with their respective owners.
