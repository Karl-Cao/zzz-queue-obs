"""Validate a narrowly scoped real-device import; never accept account tokens."""
import re


def validate_device_input(data: object, expected_uid: str) -> dict[str, str]:
    if not isinstance(data, dict) or set(data) - {'uid', 'fp', 'device_id', 'device_info'}:
        raise ValueError('Only uid, fp, device_id and optional device_info are accepted')
    if data.get('uid') != expected_uid or not re.fullmatch(r'[1-9][0-9]{8,9}', expected_uid):
        raise ValueError('The import UID must match the selected authorized Genshin UID')
    for key, minimum in [('fp', 8), ('device_id', 8)]:
        value = data.get(key)
        if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{'+str(minimum)+r',128}', value):
            raise ValueError('Missing or invalid '+key+'; use the exact value from your own device')
    result = {'uid': expected_uid, 'fp': data['fp'], 'device_id': data['device_id']}
    if 'device_info' in data and data['device_info']:
        info = data['device_info']
        if not isinstance(info, str) or len(info)>256 or len(info.split('/'))<4 or any(ord(c)<32 for c in info):
            raise ValueError('device_info must have four slash-separated parts; otherwise omit it')
        result['device_info'] = info
    return result
