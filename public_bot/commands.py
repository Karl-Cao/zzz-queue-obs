"""Parse slash-prefixed QQ commands."""
def normalize_command(text: str) -> str:
    text = text.strip()
    return text[1:].lstrip() if text.startswith('/') else text

def is_zzz_command(text: str) -> bool:
    return text.strip().startswith('/') and normalize_command(text).lower().startswith('zzz')

def is_game_command(text: str) -> bool:
    if not text.strip().startswith('/'):
        return False
    command = normalize_command(text).lower()
    for prefix in ('zzz', 'ys', 'lol'):
        if command.startswith(prefix):
            suffix = command[len(prefix):].lstrip()
            return bool(suffix) and not suffix.startswith((
                '添加ck', '添加cookie', '添加stoken', '扫码', '绑定设备',
            ))
    return False

def is_group_qr_login_command(text: str) -> bool:
    return text.strip().startswith('/') and normalize_command(text) in {
        'ys扫码登录', 'ys扫码登陆', 'zzz扫码登录', 'zzz扫码登陆',
    }

def unsupported_zzz_command(text: str) -> bool:
    text = normalize_command(text)
    if not text.lower().startswith('zzz'): return False
    return text[3:].lstrip().startswith(('音擎攻略', '突破材料'))
