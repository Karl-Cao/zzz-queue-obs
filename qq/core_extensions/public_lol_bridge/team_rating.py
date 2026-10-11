"""Display only a team Elo actually supplied by the match-detail provider."""
from decimal import Decimal, InvalidOperation


def format_team_elo(team: dict) -> str:
    value = team.get('teamElo')
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return '未提供'
    if isinstance(value, str) and (not value.strip() or len(value) > 24):
        return '未提供'
    try:
        number = Decimal(str(value))
    except InvalidOperation:
        return '未提供'
    if not number.is_finite() or number <= 0 or number > 1000000:
        return '未提供'
    return format(number.normalize(), 'f')
