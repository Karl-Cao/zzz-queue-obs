"""Windows tray manager. Same entry point for Python and PyInstaller builds."""
from __future__ import annotations

import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

ROOT = Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent
FLAGS = getattr(subprocess, 'CREATE_NO_WINDOW', 0)


class Service:
    def __init__(self, root=ROOT):
        self.root = Path(root).resolve()
        # Match Node's root (which includes the trailing separator).
        self.instance = hashlib.sha256((str(self.root).lower() + os.sep).encode()).hexdigest()[:16]
        self.http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        self.bridge = 'unknown'
        self.web_ready = False

    def runtime(self):
        return json.loads((self.root / 'data/runtime.json').read_text(encoding='utf-8'))

    def url(self):
        return f"http://127.0.0.1:{int(self.runtime()['port'])}"

    def healthy(self):
        try:
            with self.http.open(self.url() + '/api/health', timeout=1) as response:
                health = json.load(response)
            valid = health.get('app') == 'obs-viewer-queue' and health.get('instance') == self.instance
            self.bridge = health.get('bridge', 'unknown') if valid else 'unknown'
            self.web_ready = False
            if valid:
                with self.http.open(self.url() + '/', timeout=1) as response:
                    self.web_ready = b'id="app"' in response.read(65536)
            return valid and self.web_ready
        except (OSError, ValueError, KeyError):
            return False

    def command(self, *args):
        bundled = self.root / 'runtime/node.exe'
        node = str(bundled) if bundled.is_file() else shutil.which('node')
        if not node:
            raise RuntimeError('Missing Node.js / 缺少 Node.js，请使用完整发行包')
        result = subprocess.run([node, str(self.root / 'scripts/start.mjs'), *args],
                                cwd=self.root, env={**os.environ, 'QUEUE_NO_BROWSER': '1'},
                                capture_output=True, text=True, encoding='utf-8', errors='replace',
                                creationflags=FLAGS, timeout=240)
        if result.returncode:
            raise RuntimeError((result.stderr or result.stdout)[-1500:])

    def start(self):
        self.command()
        if not self.healthy():
            raise RuntimeError('Service did not become ready / 服务未就绪')

    def stop(self):
        self.command('--stop')
        deadline = time.monotonic() + 10
        while self.healthy():
            if time.monotonic() >= deadline:
                raise RuntimeError('Service is still stopping / 服务仍在停止，请稍后重试')
            time.sleep(.15)

    def restart(self):
        self.command('--restart')
        if not self.healthy():
            raise RuntimeError('Restart did not become ready / 重启后服务未就绪')


class Tray:
    def __init__(self, restart_event=None, show_event=None):
        import pystray
        from PIL import Image
        self.pystray = pystray
        self.service = Service()
        self.lock = threading.Lock()
        self.stopping = threading.Event()
        self.status = False
        self.last_open = 0
        self.restart_event, self.show_event = restart_event, show_event
        self.language = 'zh'
        try:
            self.language = json.loads((ROOT / 'data/tray.json').read_text())['language']
        except (OSError, ValueError, KeyError):
            pass
        self.icon = pystray.Icon('ZZZQueue', Image.open(ROOT / 'assets/app.ico'), 'ZZZ Queue')
        self.update_menu()

    def t(self, zh, en):
        return en if self.language == 'en' else zh

    def update_menu(self):
        item = self.pystray.MenuItem
        self.icon.menu = self.pystray.Menu(
            item(self.t('打开管理控制台', 'Open dashboard'), lambda: self.open('/'), default=True),
            item(self.t('打开直播面板', 'Open live controls'), lambda: self.open('/live')),
            item(self.t('打开 OBS 排队挂件', 'Open OBS queue overlay'), lambda: self.open('/overlay')),
            item(self.t('打开桌面悬浮窗', 'Open desktop overlay'), lambda: self.work(self.desktop)),
            self.pystray.Menu.SEPARATOR,
            item(self.t('服务正常', 'Service online') if self.status else self.t('服务未就绪', 'Service not ready'), None, enabled=False),
            item(self.t('控制台网页就绪', 'Dashboard ready') if self.service.web_ready else self.t('控制台网页未就绪', 'Dashboard not ready'), None, enabled=False),
            item(self.t('桥接已连接（不代表已有弹幕）', 'Bridge connected (not proof of chat)') if self.service.bridge == 'connected' else self.t('桥接未连接：请检查控制台', 'Bridge disconnected: check dashboard'), None, enabled=False),
            item(self.t('重启服务', 'Restart services'), lambda: self.work(self.service.restart)),
            item('English / 中文', self.switch_language),
            item(self.t('退出并停止服务', 'Exit and stop services'), lambda: self.work(self.quit)),
        )
        self.icon.title = 'ZZZ Queue · ' + (self.t('服务正常', 'Online') if self.status else self.t('服务未就绪', 'Not ready'))

    def switch_language(self):
        self.language = 'en' if self.language == 'zh' else 'zh'
        (ROOT / 'data').mkdir(exist_ok=True)
        (ROOT / 'data/tray.json').write_text(json.dumps({'language': self.language}), encoding='utf-8')
        self.update_menu()

    def open(self, path):
        if time.monotonic() - self.last_open < .7:
            return
        self.last_open = time.monotonic()
        if self.service.healthy():
            webbrowser.open(self.service.url() + path + '?lang=' + self.language)
        else:
            self.icon.notify(self.t('请右键选择重启服务。', 'Choose Restart services from the tray menu.'), 'ZZZ Queue')

    def desktop(self):
        self.service.start()
        subprocess.Popen(['powershell.exe', '-NoProfile', '-STA', '-WindowStyle', 'Hidden',
                          '-ExecutionPolicy', 'Bypass', '-File', str(ROOT / 'desktop/start.ps1'),
                          '-Language', self.language], cwd=ROOT, creationflags=FLAGS)

    def work(self, operation):
        if not self.lock.acquire(blocking=False):
            return False
        def run():
            try:
                operation()
            except Exception as error:
                (ROOT / 'data').mkdir(exist_ok=True)
                with (ROOT / 'data/tray-error.log').open('a', encoding='utf-8') as log:
                    log.write(f'{time.ctime()}: {error}\n')
                self.icon.notify(str(error)[:240], self.t('操作失败', 'Action failed'))
            finally:
                self.lock.release()
                if not self.stopping.is_set():
                    self.status = self.service.healthy()
                    self.update_menu()
        threading.Thread(target=run, daemon=True).start()
        return True

    def quit(self):
        # Stop only this installation's verified service, never arbitrary port owners.
        self.service.stop()
        kernel = windows_kernel()
        event = kernel.OpenEventW(2, False, 'Local\\ZZZQueueDesktopStop-' + self.service.instance)
        if event:
            kernel.SetEvent(event)
            kernel.CloseHandle(event)
        self.stopping.set()
        self.icon.stop()

    def setup(self, icon):
        icon.visible = True
        def start():
            if '--restart' in sys.argv:
                self.service.restart()
            else:
                self.service.start()
            self.open('/')
        self.work(start)
        def monitor():
            kernel = windows_kernel()
            pending_restart = pending_show = False
            ticks = 0
            while not self.stopping.wait(1):
                if self.restart_event and kernel.WaitForSingleObject(self.restart_event, 0) == 0:
                    pending_restart = True
                if self.show_event and kernel.WaitForSingleObject(self.show_event, 0) == 0:
                    pending_show = True
                if pending_restart and self.work(self.service.restart):
                    pending_restart = False
                if pending_show and not self.lock.locked():
                    def ensure_open():
                        self.service.start()
                        self.open('/')
                    if self.work(ensure_open):
                        pending_show = False
                ticks += 1
                if ticks % 5 == 0 and not self.lock.locked():
                    self.status = self.service.healthy()
                    self.update_menu()
        threading.Thread(target=monitor, daemon=True).start()

    def run(self):
        self.icon.run(setup=self.setup)


def windows_kernel():
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
    kernel.CreateMutexW.restype = wintypes.HANDLE
    kernel.OpenEventW.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR]
    kernel.OpenEventW.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.SetEvent.argtypes = [wintypes.HANDLE]
    kernel.CreateEventW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.BOOL, wintypes.LPCWSTR]
    kernel.CreateEventW.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.WaitForSingleObject.restype = wintypes.DWORD
    return kernel


def main():
    if '--self-test' in sys.argv:
        # For release verification in an isolated extracted installation.
        service = Service()
        if service.healthy():
            raise RuntimeError('Self-test requires a stopped installation')
        try:
            service.start()
            first = service.runtime()['pid']
            service.restart()
            assert service.runtime()['pid'] != first, 'Restart did not replace the server'
            assert service.healthy(), 'Restart failed'
        finally:
            service.stop()
        (ROOT / 'data/tray-selftest.json').write_text(json.dumps({'start': True, 'restart': True, 'stop': not service.healthy()}))
        return
    kernel = windows_kernel()
    service = Service()
    restart_event = kernel.CreateEventW(None, False, False, 'Local\\ZZZQueueRestart-' + service.instance)
    show_event = kernel.CreateEventW(None, False, False, 'Local\\ZZZQueueShow-' + service.instance)
    if not restart_event or not show_event:
        raise ctypes.WinError(ctypes.get_last_error())
    mutex = kernel.CreateMutexW(None, False, 'Local\\ZZZQueueTray-' + service.instance)
    if not mutex:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        if ctypes.get_last_error() == 183:
            kernel.SetEvent(restart_event if '--restart' in sys.argv else show_event)
            return
        Tray(restart_event, show_event).run()
    finally:
        kernel.CloseHandle(mutex)
        kernel.CloseHandle(restart_event)
        kernel.CloseHandle(show_event)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        if '--self-test' in sys.argv:
            (ROOT / 'data').mkdir(exist_ok=True)
            (ROOT / 'data/tray-selftest.json').write_text(json.dumps({'error': str(error)}))
            sys.exit(1)
        ctypes.windll.user32.MessageBoxW(None, str(error), 'ZZZ Queue', 0x10)
        raise
