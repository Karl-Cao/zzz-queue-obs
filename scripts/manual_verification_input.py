"""Validate a browser result belongs to the issued CAPTCHA session."""
import re

def verification_body(original: str, data: dict) -> dict[str, str]:
    challenge=data.get('geetest_challenge')
    validate=data.get('geetest_validate')
    seccode=data.get('geetest_seccode')
    if not isinstance(challenge,str) or not (challenge==original or (challenge.startswith(original) and re.fullmatch(r'[A-Za-z0-9_-]{1,16}',challenge[len(original):]))):
        raise ValueError('Challenge does not match this session')
    if not isinstance(validate,str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,256}',validate):
        raise ValueError('Invalid validation result')
    if seccode!=validate+'|jordan':
        raise ValueError('Invalid security code')
    return {'geetest_challenge':challenge,'geetest_validate':validate,'geetest_seccode':seccode}
