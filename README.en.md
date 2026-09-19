# ZZZ Queue OBS · Proxy Queue Terminal

English | [简体中文](README.md)

For the full beginner walkthrough in Chinese, see the [step-by-step user guide](docs/USER-GUIDE.zh-CN.md). An offline printable HTML copy is available in Releases.

A Windows portable Bilibili queue, lottery, manual voice calling and click-through chat overlay. No Docker. This is an independent project, not an official HoYoverse, LAPLACE or OBS product.

## Install

Choose a package from [Releases](https://github.com/Karl-Cao/zzz-queue-obs/releases/latest) and extract the whole folder. GitHub's automatic Source code archives are not installers.

- **EXE (recommended)**: `obs-queue-*-windows-x64-exe.zip`. Run `ZZZ Queue.exe` or `start.cmd`. No Python installation required. Keep all extracted files alongside the EXE.
- **Python**: `obs-queue-*-windows-x64-python.zip`. Install Python 3.10+ and run `start-python.cmd`. The first run downloads tray dependencies into a local `.venv/`. The editable launcher is `queue_tray.py`; the queue server still uses bundled Node.js. Event Bridge is bundled too.

Both versions have a main tray icon independent of the desktop overlay. Click it to open the dashboard. Its menu opens live controls, OBS and desktop overlays, restarts services, switches language, or exits and stops services. Exit also closes this installation's desktop overlay and the bridge started by its server; externally managed/shared bridges remain running. Windows may place the icon in its tray overflow menu.

- `start.cmd`: main tray and dashboard; select English at the top right.
- `desktop-en.cmd`: English desktop overlay. `desktop.cmd`: Chinese desktop overlay.
- `stop.cmd`: stop this installation's service.
- `enable-lan.cmd`: allow phone/tablet access on the local network; requires Windows administrator approval.

Windows 10/11 x64. Node.js and Event Bridge are bundled. Desktop UI uses Windows .NET Framework; speech uses installed Windows voices. The app is unsigned. Release assets include SHA-256 checksums.

## Connect

### Startup and restart checks

Concurrent starts in the same installation are serialized. Opening the app again asks the existing tray to open its dashboard. `ZZZ Queue.exe --restart` or `python queue_tray.py --restart` requests a restart from the running tray. Restart waits for the old service to stop and preserves its assigned port. Initial startup selects another port if the default belongs to another app, and allows up to 90 seconds on slower PCs. Tray status distinguishes the server, dashboard and bridge; a connected bridge is not proof of live events.

Shutdown is graceful first. Hung-process recovery requires both the exact Node executable and this installation's server entry path to match before stopping its process tree. Different installation folders have separate data; run one installation at a time.

Save your Bilibili room ID in Settings. The default bridge is `ws://127.0.0.1:9696`, started automatically. In the LAPLACE dashboard, open the gear/settings panel, scroll to Event Bridge and enable it with the same URL and token. Leave both tokens blank if none is configured. Send a real message and verify the received-event counter; a connected bridge alone is not proof of live delivery.

Data path: LAPLACE dashboard → Event Bridge → this app. Choose a LAPLACE connection mode providing reliable viewer UIDs; anonymous modes may mask identities. Keep unauthenticated bridges bound to localhost.

For one monitor, host `https://chat.laplace.live/dashboard/ROOM_ID` in an OBS browser source. Configure through Interact, keep the source in the active scene underneath game capture, and disable shutdown when invisible. OBS and normal browsers have separate settings. Short background forwarding tests passed; long sessions still need validation on your device.

## Current and Up next

Chat joins, eligible gifts and lottery winners only update **Up next**, silently. **Complete current & call next** archives the current viewer, promotes the first waiting viewer, and announces that viewer once. With an empty waiting queue it only completes the current viewer. **Repeat current call** never advances.

Waiting viewers rank by cumulative eligible gifts, with arrival order breaking ties. Lottery winners are pinned ahead of paid entries; newer winners precede older winners. None of this replaces Current. Events from the current viewer cannot create a duplicate waiting entry; they may rejoin after completion.

Free entry can be disabled. Paid entry requires an individual gift of at least ¥0.10 and the configured minimum. Below-minimum gifts and silver-coin gifts do not count. The free-entry switch does not disable lottery participation. Lottery gifts match by name, allowing multiple gift IDs with the same name. There is no gift gallery in the dashboard.

Manual advancement prevents queue joins from automatically speaking over chat. It does not automatically coordinate with LAPLACE's separate chat TTS engine.

## Screens and voice

- Desktop: Ctrl+Alt+Q toggles controls/click-through; Ctrl+Alt+H shows/hides. Drag the title in control mode. Tray menu provides exit. Use borderless/windowed games; exclusive fullscreen may cover ordinary desktop windows.
- OBS queue: `http://127.0.0.1:PORT/overlay?lang=en`, suggested 360 × 400.
- OBS chat: `http://127.0.0.1:PORT/chat-overlay?lang=en`. Enable **Show chat in OBS chat overlay** in Settings. It is off by default, independently of desktop/mobile chat.
- Display Capture may also capture your desktop overlay; use Game Capture and check preview if chat should stay private.
- Phone/tablet: use the detected LAN URL and pair with the PC's eight-digit code. Sessions last 12 hours.

Enable **Windows background TTS** and select Announcement language in Settings. Install a suitable Windows voice if necessary. Background speech does not require a visible browser. Capture the correct audio output in OBS and avoid enabling duplicate phone speech.

## Upgrade and build

Exit the desktop overlay and stop the old service. Extract the new release, copy the old `data/` directory into it, then start. Old queues remain waiting; upgrading does not automatically call anyone. Legacy local port 9698 also supports automatic bridge startup. Never publish `data/`, tokens or private OBS URLs.

Development: Node.js 22+, no production npm dependencies.

```powershell
npm test
python tests/tray_test.py
python -m pip install -r requirements-build.txt
powershell -ExecutionPolicy Bypass -File scripts/fetch-dependencies.ps1
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1
```

Build inputs use pinned official versions and SHA-256 verification. Releases contain dependency licenses and corresponding Event Bridge source. App code: MIT. See [third-party notices](THIRD-PARTY-NOTICES.md).

The 360×400 queue overlay keeps the current viewer fixed. Choose automatic pages (capacity follows source height) or continuous scrolling in Settings; all waiting viewers are included.

The dashboard shows the running version, folder and URL, and detects other copies on ports 3667–3766. Operator-only chat diagnostics explain blank overlays. Undo the latest removal/advance within 20 seconds. Configure page interval, scroll speed, font size and amount visibility; ordinary queue updates preserve viewing progress where possible.
