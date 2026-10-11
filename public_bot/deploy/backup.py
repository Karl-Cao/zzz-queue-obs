"""Keep seven root-only daily snapshots of account data and server credentials."""
from pathlib import Path
import os
import sqlite3
import tarfile
import tempfile
from contextlib import closing
from datetime import datetime, timezone

os.umask(0o077)
destination = Path('/var/backups/zzz-public-qq')
destination.mkdir(mode=0o700, parents=True, exist_ok=True)
archive = destination / (datetime.now(timezone.utc).strftime('%Y-%m-%d-%H%M%S') + '.tar.gz')
with tempfile.TemporaryDirectory(prefix='zzz-backup-') as temporary:
    database = Path(temporary) / 'GsData.db'
    with sqlite3.connect('file:/opt/gsuid-core/data/GsData.db?mode=ro', uri=True) as source:
        with sqlite3.connect(database) as snapshot:
            source.backup(snapshot)
    with tarfile.open(archive, 'w:gz') as output:
        output.add(database, arcname='core-data/GsData.db')
        pubg_source = Path('/var/lib/zzz-public-qq/pubg.sqlite3')
        if pubg_source.exists():
            pubg_snapshot = Path(temporary) / 'pubg.sqlite3'
            with closing(sqlite3.connect(f'file:{pubg_source}?mode=ro', uri=True)) as source:
                with closing(sqlite3.connect(pubg_snapshot)) as snapshot:
                    source.backup(snapshot)
            output.add(pubg_snapshot, arcname='pubg/pubg.sqlite3')
        for path, name in [
            ('/var/lib/zzz-public-qq/relay/bindings.json', 'relay/bindings.json'),
            ('/opt/gsuid-core/data/config.json', 'core-data/config.json'),
            ('/opt/gsuid-core/data/configs', 'core-data/configs'),
            ('/opt/gsuid-core/data/plugins_configs', 'core-data/plugins_configs'),
            ('/opt/gsuid-core/data/ZZZeroUID/config.json', 'core-data/ZZZeroUID/config.json'),
            ('/etc/zzz-public-qq.env', 'secrets/service.env'),
            ('/etc/cloudflared', 'secrets/cloudflared'),
        ]:
            if Path(path).exists():
                output.add(path, arcname=name)
archive.chmod(0o600)
for old in sorted(destination.glob('*.tar.gz'))[:-7]:
    old.unlink()
print('Private daily snapshot created')
