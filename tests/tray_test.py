import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import tempfile
import unittest
import subprocess
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('queue_tray', ROOT / 'queue_tray.py')
tray = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tray)


class TrayLifecycle(unittest.TestCase):
    def test_start_restart_stop_and_cross_installation_identity(self):
        with tempfile.TemporaryDirectory(prefix='zzz-tray-') as directory:
            root = Path(directory)
            for folder in ('server', 'public', 'scripts'):
                shutil.copytree(ROOT / folder, root / folder)
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', 0))
                port = str(sock.getsockname()[1])
            service = tray.Service(root)
            with patch.dict(os.environ, {'QUEUE_DISABLE_BRIDGE': '1', 'PORT': port}):
                try:
                    def concurrent_start(_):
                        another = tray.Service(root)
                        another.start()
                        return another.runtime()['pid']
                    with ThreadPoolExecutor(max_workers=4) as pool:
                        pids = list(pool.map(concurrent_start, range(4)))
                    self.assertEqual(len(set(pids)), 1, 'Parallel launch created duplicate servers')
                    self.assertTrue(service.healthy())
                    first = service.runtime()['pid']
                    service.restart()
                    self.assertNotEqual(service.runtime()['pid'], first)
                    self.assertTrue(service.healthy())
                    impostor = tray.Service(root)
                    impostor.instance = 'another-installation'
                    self.assertFalse(impostor.healthy())
                finally:
                    service.stop()
                self.assertFalse(service.healthy())
                self.assertTrue((root / 'data').exists())

    def test_occupied_port_reuse_and_hung_process_recovery(self):
        with tempfile.TemporaryDirectory(prefix='zzz-tray-') as directory:
            root = Path(directory)
            for folder in ('server', 'public', 'scripts'):
                shutil.copytree(ROOT / folder, root / folder)
            service = tray.Service(root)
            with socket.socket() as blocker:
                blocker.bind(('0.0.0.0', 0))
                blocker.listen()
                port = blocker.getsockname()[1]
                with patch.dict(os.environ, {'QUEUE_DISABLE_BRIDGE': '1', 'PORT': str(port)}):
                    try:
                        service.start()
                        selected = service.runtime()['port']
                        self.assertNotEqual(selected, port)
                        service.restart()
                        self.assertEqual(service.runtime()['port'], selected)
                    finally:
                        service.stop()
                    # A wedged process at the exact owned entry can be recovered.
                    entry = root / 'server/index.mjs'
                    entry.write_text('setInterval(()=>{},1000);')
                    child = subprocess.Popen([shutil.which('node'), str(entry)], creationflags=tray.FLAGS)
                    try:
                        (root / 'data/runtime.json').write_text(json.dumps({'pid': child.pid, 'port': selected, 'instance': service.instance}))
                        service.stop()
                        child.wait(timeout=5)
                    finally:
                        if child.poll() is None:
                            child.kill()
                            child.wait()
                    # Never kill an unrelated process just because its PID is recorded.
                    other = subprocess.Popen([shutil.which('node'), '-e', 'setInterval(()=>{},1000)'], creationflags=tray.FLAGS)
                    try:
                        (root / 'data/runtime.json').write_text(json.dumps({'pid': other.pid, 'port': selected, 'instance': service.instance}))
                        service.stop()
                        self.assertIsNone(other.poll())
                    finally:
                        other.kill()
                        other.wait()


if __name__ == '__main__':
    unittest.main()
