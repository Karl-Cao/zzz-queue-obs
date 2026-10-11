#!/bin/bash
set -euo pipefail
umask 077
stage=/home/ubuntu/zzz-deploy-stage
mkdir -p "$stage"
tar -xzf /home/ubuntu/application-thin.tar.gz -C "$stage"
cp -a "$stage/queue/public_bot" /opt/zzz-queue-obs/
install -m 644 /home/ubuntu/apply-core-qr-patch.py /opt/zzz-queue-obs/public_bot/apply-core-qr-patch.py
install -d /opt/zzz-queue-obs/server
install -m 644 /home/ubuntu/qr-image.mjs /opt/zzz-queue-obs/server/qr-image.mjs
cp -a "$stage/gsuid-core/." /opt/gsuid-core/
install -m 600 /home/ubuntu/service.env /etc/zzz-public-qq.env
install -d -m 700 /etc/cloudflared
install -m 600 /home/ubuntu/tunnel.json /etc/cloudflared/zzz-public-qq.json
cat > /etc/cloudflared/zzz-public-qq.yml <<'EOF'
tunnel: d66da935-380e-4d18-a2ba-2ea5b25d23d3
credentials-file: /etc/cloudflared/zzz-public-qq.json
ingress:
  - hostname: qq.zenlesszonezero.fans
    path: ^/(health|client(/.*)?)$
    service: http://127.0.0.1:8787
  - service: http_status:404
EOF
python3 - <<'PY'
from pathlib import Path
import json
p=Path('/opt/gsuid-core/data/configs/core_config.json')
c=json.loads(p.read_text())
for key in ('AutoUpdateCore','AutoUpdatePlugins','AutoUpdateDep','AutoRestartCore'):
    if key in c:
        if isinstance(c[key],dict): c[key]['data']=False
        else: c[key]=False
p.write_text(json.dumps(c,ensure_ascii=False,indent=2))
PY
python3 -m venv /opt/gsuid-core/.venv
/opt/zzz-queue-obs/.venv/bin/uv sync --project /opt/gsuid-core --frozen --no-dev
/opt/zzz-queue-obs/.venv/bin/uv pip install --python /opt/gsuid-core/.venv/bin/python pip
/opt/zzz-queue-obs/.venv/bin/uv pip install --python /opt/zzz-queue-obs/.venv/bin/python 'nonebot2[fastapi,httpx,websockets]==2.5.0' 'nonebot-adapter-qq==1.7.2' 'nonebot-plugin-genshinuid==6.1.1' 'nonebot-plugin-alconna==0.62.1' 'nonebot-plugin-apscheduler==0.5.0'
cp -a "$stage/adapter/GenshinUID/." /opt/zzz-queue-obs/.venv/lib/python3.12/site-packages/GenshinUID/
/opt/zzz-queue-obs/.venv/bin/python /opt/zzz-queue-obs/public_bot/apply-core-qr-patch.py /opt/gsuid-core
chown -R zzzqueue:zzzqueue /opt/gsuid-core /opt/zzz-queue-obs /var/lib/zzz-public-qq
chmod -R go-w /opt/gsuid-core /opt/zzz-queue-obs
chmod -R go-rwx /opt/gsuid-core/data /var/lib/zzz-public-qq
for service in core bot relay tunnel; do
    cp "/opt/zzz-queue-obs/public_bot/deploy/zzz-public-qq-$service.service.example" "/etc/systemd/system/zzz-public-qq-$service.service"
done
sed -i 's|ExecStart=/usr/bin/node |ExecStart=/usr/local/bin/node |' /etc/systemd/system/zzz-public-qq-relay.service
cat >> /etc/systemd/system/zzz-public-qq-bot.service <<'EOF'

[Unit]
After=zzz-public-qq-core.service
Wants=zzz-public-qq-core.service

[Service]
Environment=HOME=/var/lib/zzz-public-qq
ReadWritePaths=/opt/gsuid-core/data /var/lib/zzz-public-qq
EOF
systemctl daemon-reload
systemctl start zzz-public-qq-core
printf '\nInstallation complete; bot and tunnel remain stopped pending cutover.\n'
