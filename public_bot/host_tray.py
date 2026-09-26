"""Temporary Windows tray controller for the locally hosted public QQ bot."""
from __future__ import annotations

import ctypes
from ctypes import wintypes
from pathlib import Path
import subprocess
import sys
import threading
import time


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / 'public_bot/home-host.ps1'
IMAGE = ROOT / 'public_bot/assets/bot-tray.png'
LOG = ROOT / 'data/public-qq-host/tray-error.log'
FLAGS = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
MUTEX_NAME = 'Local\\ZZZPublicQQHostTray'


def action(name, timeout=120):
    result = subprocess.run(
        ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy',
         'Bypass', '-File', str(SCRIPT), '-Action', name],
        cwd=ROOT, capture_output=True, text=True, encoding='utf-8',
        errors='replace', creationflags=FLAGS, timeout=timeout,
    )
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout)[-1200:] or f'{name} failed')
    return result.stdout.strip()


def log_error(error):
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open('a', encoding='utf-8') as file:
        file.write(f'{time.ctime()}: {error}\n')


class HostTray:
    def __init__(self, attention_event=None):
        import pystray
        from PIL import Image
        self.pystray = pystray
        self.lock = threading.Lock()
        self.stopping = threading.Event()
        self.attention_event = attention_event
        self.status = '正在检查服务状态…'
        self.icon = pystray.Icon('ZZZPublicQQHost', Image.open(IMAGE).convert('RGBA'),
                                '然神 QQ 公共机器人')
        self.update_menu()

    def update_menu(self):
        item = self.pystray.MenuItem
        self.icon.menu = self.pystray.Menu(
            item('公共机器人 · 本机临时托管', None, enabled=False),
            item(self.status, None, enabled=False),
            self.pystray.Menu.SEPARATOR,
            item('刷新状态', lambda: self.work(self.refresh), default=True),
            item('重启公共机器人服务', lambda: self.work(self.restart)),
            item('退出并停止公共服务', lambda: self.work(self.quit)),
        )
        self.icon.title = '然神 QQ 公共机器人 · ' + self.status[:60]

    def refresh(self):
        lines = action('Status', timeout=20)
        states = dict(line.split(': ', 1) for line in lines.splitlines() if ': ' in line)
        healthy = all(states.get(name, '').startswith(('running', 'available'))
                      for name in ('relay', 'tunnel', 'core', 'bot'))
        self.status = '中转 / 隧道 / 查询 / 机器人正常' if healthy else '部分服务未运行（查看日志）'
        self.update_menu()
        return healthy

    def start(self):
        action('StartRelay')
        action('StartBot')
        self.refresh()

    def restart(self):
        self.status = '正在重启…'
        self.update_menu()
        action('Stop', timeout=45)
        self.start()
        self.icon.notify('公共 QQ 服务已重启', '然神 QQ 公共机器人')

    def quit(self):
        action('Stop', timeout=45)
        self.stopping.set()
        self.icon.stop()

    def work(self, operation):
        if not self.lock.acquire(blocking=False):
            return False

        def run():
            try:
                operation()
            except Exception as error:
                log_error(error)
                self.status = '操作失败（查看 tray-error.log）'
                self.update_menu()
                self.icon.notify(str(error)[:220], '公共 QQ 服务操作失败')
            finally:
                self.lock.release()

        threading.Thread(target=run, daemon=True).start()
        return True

    def setup(self, icon):
        icon.visible = True
        icon.notify('公共机器人托盘已启动，图标位于任务栏通知区域。', '然神 QQ 公共机器人')
        self.work(self.start)

        def monitor():
            kernel = ctypes.WinDLL('kernel32', use_last_error=True)
            kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
            kernel.WaitForSingleObject.restype = wintypes.DWORD
            ticks = 0
            while not self.stopping.wait(1):
                if self.attention_event and kernel.WaitForSingleObject(self.attention_event, 0) == 0:
                    icon.visible = True
                    icon.notify('公共机器人已在运行，图标位于任务栏通知区域。', '然神 QQ 公共机器人')
                ticks += 1
                if ticks % 15 == 0:
                    self.work(self.refresh)

        threading.Thread(target=monitor, daemon=True).start()

    def run(self):
        self.icon.run(setup=self.setup)


def main():
    if '--self-test' in sys.argv:
        from PIL import Image
        with Image.open(IMAGE) as icon:
            assert icon.width >= 32 and icon.height >= 32
        assert SCRIPT.is_file()
        return
    if '--status' in sys.argv:
        print(action('Status', timeout=20))
        return
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
    kernel.CreateMutexW.restype = wintypes.HANDLE
    kernel.CreateEventW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.BOOL, wintypes.LPCWSTR]
    kernel.CreateEventW.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.SetEvent.argtypes = [wintypes.HANDLE]
    attention_event = kernel.CreateEventW(None, False, False, 'Local\\ZZZPublicQQHostTrayAttention')
    if not attention_event:
        raise ctypes.WinError(ctypes.get_last_error())
    mutex = kernel.CreateMutexW(None, False, MUTEX_NAME)
    if not mutex:
        raise ctypes.WinError(ctypes.get_last_error())
    already_running = ctypes.get_last_error() == 183
    try:
        if already_running:
            kernel.SetEvent(attention_event)
        else:
            HostTray(attention_event).run()
    finally:
        kernel.CloseHandle(mutex)
        kernel.CloseHandle(attention_event)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        log_error(error)
        if '--self-test' in sys.argv or '--status' in sys.argv:
            raise
        ctypes.windll.user32.MessageBoxW(None, str(error), '然神 QQ 公共机器人', 0x10)
