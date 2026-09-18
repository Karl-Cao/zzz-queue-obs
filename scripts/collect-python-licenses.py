"""Collect licenses for the Python runtime and tray dependencies in the EXE."""
from importlib.metadata import distribution
from pathlib import Path
import shutil
import sys

target = Path(sys.argv[1])
target.mkdir(parents=True, exist_ok=True)
for name in ('pystray', 'Pillow', 'six', 'PyInstaller', 'packaging'):
    dist = distribution(name)
    found = False
    for entry in dist.files or []:
        if 'license' in str(entry).lower() or 'copying' in entry.name.lower():
            source = Path(dist.locate_file(entry))
            if source.is_file() and source.suffix not in ('.py', '.pyc'):
                dest = target / name / str(entry).replace('/', '_')
                dest.parent.mkdir(exist_ok=True)
                shutil.copyfile(source, dest)
                found = True
    if not found:
        raise RuntimeError(f'Missing license for {name}')
shutil.copyfile(Path(sys.base_prefix) / 'LICENSE.txt', target / 'Python-LICENSE.txt')
