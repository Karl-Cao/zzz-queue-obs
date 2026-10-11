# Oracle public bot deployment

Deployed on 2026-10-01 to Ubuntu 24.04 ARM64 in San Jose: 1 OCPU, 6 GB RAM, 50 GB boot volume and 2 GB swap. Public endpoint: https://qq.zenlesszonezero.fans. The existing Cloudflare Tunnel now runs on Oracle; DNS and streamer endpoint URLs did not change.

The public relay, official QQ bot, gsuid-core and ZZZeroUID are installed under `/opt/zzz-queue-obs` and `/opt/gsuid-core`. Node.js 22 runs the relay; Python 3.12 runs the bot and query core. The current reviewed core, QR login safeguard, patched QQ adapter, account database and bindings were migrated from the working Windows installation. Public artwork is downloaded by the server. No streamer release was built or published.

## Service operations

The community websites were added on 2026-10-01, then moved to Cloudflare free Static Assets: `https://zenlesszonezero.fans`, `https://排队.zenlesszonezero.fans`, and `https://qq.zenlesszonezero.fans`. Oracle's `zzz-community-web` service is stopped and disabled, with its release retained for rollback. More-specific Cloudflare no-script routes preserve `/health*` and `/client*` on the QQ domain, and the tunnel permits only the original `/health` and `/client/*` relay paths. All other tunnel requests and `/bot/*` remain inaccessible. Website maintenance is documented in [website/README.md](../../website/README.md).

Connect using your instance's SSH private key:

```text
ssh -i YOUR_PRIVATE_KEY ubuntu@152.70.117.62
```

```sh
sudo systemctl status zzz-public-qq-{core,relay,bot,tunnel}
sudo systemctl restart zzz-public-qq-core zzz-public-qq-relay
sudo systemctl restart zzz-public-qq-bot zzz-public-qq-tunnel
sudo journalctl -u zzz-public-qq-bot -n 50 --no-pager
curl -fsS https://qq.zenlesszonezero.fans/health
```

All four services are enabled at boot. The bot waits for the private core port before connecting. The QQ adapter remains pinned to the working versions: NoneBot2 2.5.0, QQ adapter 1.7.2, GenshinUID 6.1.1, Alconna 0.62.1 and APScheduler plugin 0.5.0. Core dependencies use its existing `uv.lock`. Unattended core/plugin updates are disabled to preserve the reviewed login patch; update deliberately and verify the patch before restarting.

The relay, bot and query core bind only to `127.0.0.1`, on ports 8787, 18081 and 8765 respectively. The tunnel exposes only `/health` and `/client/*`; internal `/bot/*`, query WebConsole and bot endpoints remain private. There is no need to open those application ports in the OCI security list.

## Data and backups

- Relay bindings: `/var/lib/zzz-public-qq/relay/bindings.json`.
- Query accounts and configuration: `/opt/gsuid-core/data`.
- Server credentials: `/etc/zzz-public-qq.env`, readable by root.
- Tunnel credentials and configuration: `/etc/cloudflared`, readable by root.
- Daily backups: `/var/backups/zzz-public-qq`, seven root-only snapshots retained by `zzz-public-qq-backup.timer`.

The daily backup includes a consistent SQLite snapshot, bindings, configuration and server credentials. Treat these archives as secrets. Artwork can be downloaded again. Backups are currently stored on the same boot volume; they protect against accidental edits, but an independent copy is needed to recover from losing the entire instance or boot volume.

## Reviewed upstream update — 2026-10-01

gsuid-core was updated from `d3acf7f` (0.10.8) to `87c06f11ae10c12b3bb8e76b3c6f420c831282a8` (0.11.0), after fetching and reviewing 17 upstream commits. ZZZeroUID remains at `7774832fdc6563613668f8c1235e4933afd2301d`, which was already the upstream head. Its existing Enka compatibility patch remains intact.

The active core source and independent Python environment are now under `/opt/gsuid-core-releases/87c06f1`. The systemd drop-in `/etc/systemd/system/zzz-public-qq-core.service.d/upstream-release.conf` selects this release. The release's `data` symlink points to the existing `/opt/gsuid-core/data`, and its ZZZeroUID plugin symlink points to the existing plugin checkout. Backup paths, account database, bot credentials, relay bindings and public endpoint are unchanged. `/opt/gsuid-core` retains the previous core and environment for rollback; its Git HEAD is therefore no longer the active core version. Use `systemctl show zzz-public-qq-core -p WorkingDirectory` before subsequent upstream checks.

Validation: isolated database-copy startup on localhost port 18765, then production port 8765; both returned a valid ZZZ help image. The reviewed QR patch was reapplied and verified, mismatched UID authorization was rejected, account table counts were preserved, and QQ gateway/core connections and public health passed. The relay and tunnel were not restarted. The temporary smoke service is stopped. A root-only deployment record is saved at `/var/backups/zzz-public-qq/upstream-2026-10-01.json`.

For rollback, stop bot/core, remove only this release's `upstream-release.conf` drop-in, daemon-reload, then start the original core and bot. Check database compatibility first and use the pre-update private snapshot if account data restoration is needed. Never run both query cores against the same account database.

```sh
sudo systemctl start zzz-public-qq-backup
sudo systemctl list-timers zzz-public-qq-backup.timer
sudo ls -lh /var/backups/zzz-public-qq
```

For restoration, stop the bot, relay and core first. Extract the selected backup into a private staging directory, restore its account database and configuration to `/opt/gsuid-core/data`, bindings to `/var/lib/zzz-public-qq/relay`, and credentials to their `/etc` locations. Restore ownership to `zzzqueue` for application data and root for credentials, with mode 600 on secret files, then restart core/relay followed by bot/tunnel. Do not extract an archive blindly over `/`.

## Windows host after migration

GenshinUID and LOLegendsUID were installed on 2026-10-01 alongside ZZZeroUID, with persistent checkouts under `/opt/gsuid-core/gsuid_core/plugins/` and symlinks in the active release. Shared account data remains in `/opt/gsuid-core/data`. The public adapter admits slash-prefixed `/ys`, `/lol`, and `/zzz` group @ queries; credential submission commands and all private game queries are excluded. QQ panels expose help entry points only. See [game plugin deployment and limitations](../../docs/PUBLIC-BOT-GAME-PLUGINS.zh-CN.md). LOL queries still require operator-provided valid WeGame credentials; installation is not a successful live match-query acceptance test.

The local queue, OBS widgets, desktop overlays and TTS continue running on the streamer computer. Existing client tokens and both group bindings were preserved, so streamers keep the same public URL and do not need to bind again.

`data/public-qq-host/remote-host.json` disables the former PC hosting. The main tray skips starting its public-host tray, and `home-host.ps1` will not start another public QQ gateway. The old files are retained for recovery. Never start the PC bot while the Oracle bot is connected with the same QQ AppID. To deliberately roll back, stop all four Oracle services first, remove the local migration marker, then start the former PC host.

For a live acceptance check, genuinely mention the official robot in a bound group with `/zzz帮助` and `/排队`, then use the streamer console to call a queued QQ member and verify a real QQ mention.

Genshin commands now use `/ys`; old `/gs` commands receive a migration hint. Persistent plugin configuration sets `prefix=["ys"]`, `disable_force_prefix=true`, and `allow_empty_prefix=false`. `data/GenshinUID/config.json` keeps `OldPanle.data=false` for the current HTML UI. The core QR-login patch and UID guard also use `/ys`, and QQ command panels were synchronized. A live `/ys查询 雷电将军102823666` rendered the new 2560×6496 panel. This is a server-only update; streamer software and bindings are unchanged.


## Reviewed upstream single-file fix — 2026-10-11

Upstream ZZZeroUID added one commit, `0cd503e6d12f0669cf16013660f8a4c35dbbb4f1`, changing only `ZZZeroUID/zzzerouid_code/data_source.py`. Its exact upstream file was applied after a private backup and normalized-content comparison of the old file. The repository Git base remains `7774832` because the migrated checkout would not fast-forward cleanly; other local patches remain intact. The deployed file fixes preview navigation and multiple redemption codes. Isolated async tests verified both behaviors before core/bot restart. Private pre-update source: `/var/backups/zzz-public-qq/zzzero-code-before-20261011.py`. This is server-only; streamer identities and group routing are unchanged.
