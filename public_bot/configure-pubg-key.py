"""Operator-only SSH stdin credential setup. Never print or log the key."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

def main():
    if os.geteuid() != 0:
        raise RuntimeError('Root required')
    data = json.loads(sys.stdin.read(8192))
    key = data.get('key', '')
    if not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', key) or len(key) > 4096:
        raise ValueError('Invalid key format')
    req = Request('https://api.pubg.com/shards/steam/seasons', headers={
        'Authorization': 'Bearer '+key, 'Accept': 'application/vnd.api+json'})
    try:
        with urlopen(req, timeout=15) as response:
            payload = json.load(response)
            if not isinstance(payload.get('data'), list):
                raise ValueError('Invalid PUBG response')
    except HTTPError as e:
        print(json.dumps({'ok': False, 'apiStatus': e.code})); return
    path = Path('/etc/zzz-public-qq.env')
    lines = [line for line in path.read_text().splitlines() if not line.startswith('PUBG_API_KEY=')]
    lines.append('PUBG_API_KEY='+key)
    tmp = path.with_name('zzz-public-qq.env.pubg-tmp')
    fd = os.open(tmp, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'w') as out:
            out.write('\n'.join(lines)+'\n')
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)
    subprocess.run(['systemctl', 'restart', 'zzz-public-qq-bot'], check=True, capture_output=True)
    time.sleep(3)
    r = subprocess.run(['systemctl', 'is-active', 'zzz-public-qq-bot'], capture_output=True, text=True)
    print(json.dumps({'ok': r.returncode == 0, 'apiValidated': True, 'botState': r.stdout.strip()}))

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(json.dumps({'ok': False, 'error': type(e).__name__})); sys.exit(1)
