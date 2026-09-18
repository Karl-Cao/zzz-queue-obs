import importlib.util
import json
import os
from pathlib import Path
import shutil
import socket
import tempfile
import unittest
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
                    service.start()
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


if __name__ == '__main__':
    unittest.main()
