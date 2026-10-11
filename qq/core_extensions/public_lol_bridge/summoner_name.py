"""Preserve the complete national-server summoner identity in searches."""
import re


def normalize_summoner_name(value: str) -> str | None:
    value = value.strip().replace('＃', '#')
    name, separator, tag = value.rpartition('#')
    if not separator or not name.strip() or '#' in name or not re.fullmatch(r'[0-9]+', tag):
        return None
    return name.strip() + '#' + tag


def normalize_lol_uid(value: str) -> str | None:
    value = re.sub(r'^UID\s*[:：]\s*', '', value.strip(), flags=re.IGNORECASE)
    account, separator, area = value.rpartition(':')
    account = account.strip()
    area = area.strip()
    if (not separator or not re.fullmatch(r'[A-Za-z0-9_+/=-]{4,128}', account)
            or not re.fullmatch(r'[0-9]{1,3}', area) or int(area) < 1):
        return None
    return account + ':' + str(int(area))


def normalize_binding_argument(command: str, value: str) -> str | None:
    # The upstream parser may match the short alias before "绑定UID".
    if command in {'绑定', '切换'}:
        value = re.sub(r'^uid\s*', '', value.lstrip(), flags=re.IGNORECASE)
    return normalize_lol_uid(value)
