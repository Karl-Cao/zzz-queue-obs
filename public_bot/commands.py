"""Normalize the optional slash added by QQ command panels."""
def normalize_command(text: str) -> str:
    text = text.strip()
    return text[1:].lstrip() if text.startswith('/') else text

def is_zzz_command(text: str) -> bool:
    return normalize_command(text).lower().startswith('zzz')

def unsupported_zzz_command(text: str) -> bool:
    text = normalize_command(text)
    if not text.lower().startswith('zzz'): return False
    return text[3:].lstrip().startswith(('角色图鉴','音擎攻略','驱动盘','突破材料','武器','邦布'))
