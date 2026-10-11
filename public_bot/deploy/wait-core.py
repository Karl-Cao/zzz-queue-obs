"""Wait for the private query service before the QQ adapter starts."""
import socket
import time
import os

if os.environ.get('PUBLIC_QQ_ENABLE_ZZZ') != '1':
    raise SystemExit(0)

for _ in range(60):
    try:
        with socket.create_connection(('127.0.0.1', 8765), timeout=1):
            break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit('Query core did not become ready within 60 seconds')
