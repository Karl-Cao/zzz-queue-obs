"""This operator's Windows setup: hidden prompt, SSH stdin, no key persistence."""
import getpass
import json
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]

def main():
    print('PUBG API Key setup. Input is hidden; nothing is saved on this PC.')
    value = getpass.getpass('Paste the PUBG developer API Key, then press Enter: ').strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', value) or len(value) > 4096:
        print('Invalid format. Paste only the API Key, without Bearer or quotes.'); return
    keyfile = Path(tempfile.gettempdir())/('zzz-pubg-setup-'+secrets.token_hex(8)+'.key')
    try:
        shutil.copyfile(r'C:\Users\Karl1\Documents\ssh-key-2026-09-26.key', keyfile)
        account = subprocess.check_output(['whoami'], text=True).strip()
        subprocess.run(['icacls', str(keyfile), '/inheritance:r', '/grant:r', account+':(F)'], check=True, capture_output=True)
        args = ['ssh', '-i', str(keyfile), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=yes',
                '-o', 'UserKnownHostsFile='+str(ROOT/'data/oracle-known-hosts'), 'ubuntu@152.70.117.62',
                'sudo python3 /opt/zzz-queue-obs/public_bot/configure-pubg-key.py']
        result = subprocess.run(args, input=json.dumps({'key': value}), text=True, capture_output=True, timeout=90)
        value = ''
        if result.returncode:
            print('Setup failed. No credentials will be displayed. Please tell Codex setup failed.'); return
        outcome = json.loads(result.stdout.strip().splitlines()[-1])
        if outcome.get('ok'):
            print('Success: PUBG API validated and public bot restarted. Test /pubg帮助 in QQ.')
        else:
            print('Not configured successfully. Safe status:', json.dumps(outcome))
    finally:
        keyfile.unlink(missing_ok=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print('Setup failed:', type(e).__name__)
