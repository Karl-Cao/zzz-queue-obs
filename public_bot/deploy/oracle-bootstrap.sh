#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y python3-venv python3-dev build-essential git curl ca-certificates fonts-noto-cjk libglib2.0-0t64 libgl1
if ! id zzzqueue >/dev/null 2>&1; then useradd --system --create-home --home-dir /var/lib/zzz-public-qq --shell /usr/sbin/nologin zzzqueue; fi
install -d -m 750 -o zzzqueue -g zzzqueue /var/lib/zzz-public-qq /opt/zzz-queue-obs /opt/gsuid-core
if ! test -f /swapfile; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi
if ! command -v node >/dev/null || test "$(node -p 'process.versions.node.split(".")[0]')" -lt 22; then
    work=$(mktemp -d)
    curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$work/SHASUMS256.txt"
    archive=$(awk '/ node-v22.*-linux-arm64.tar.xz$/ {print $2}' "$work/SHASUMS256.txt")
    test -n "$archive"
    curl -fsSL "https://nodejs.org/dist/latest-v22.x/$archive" -o "$work/$archive"
    (cd "$work"; grep " $archive$" SHASUMS256.txt | sha256sum -c -)
    tar -xJf "$work/$archive" --strip-components=1 -C /usr/local
fi
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
printf 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main\n' > /etc/apt/sources.list.d/cloudflared.list
apt-get update
apt-get install -y cloudflared
python3 -m venv /opt/zzz-queue-obs/.venv
/opt/zzz-queue-obs/.venv/bin/pip install uv
printf '\nBootstrap ready\n'
