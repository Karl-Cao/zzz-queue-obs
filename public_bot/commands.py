"""Parse slash-prefixed QQ commands."""
def normalize_command(text: str) -> str:
    text = text.strip()
    return text[1:].lstrip() if text.startswith('/') else text

def is_zzz_command(text: str) -> bool:
    return text.strip().startswith('/') and normalize_command(text).lower().startswith('zzz')

def is_group_qr_login_command(text: str) -> bool:
    return text.strip().startswith('/') and normalize_command(text) in {'扫码登录', '扫码登陆'}

def unsupported_zzz_command(text: str) -> bool:
    text = normalize_command(text)
    if not text.lower().startswith('zzz'): return False
    return text[3:].lstrip().startswith(('音擎攻略', '突破材料'))
