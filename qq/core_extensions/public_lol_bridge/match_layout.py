"""Keep the queried account's team, players and statistics in the same row."""


def ordered_match_teams(detail, account):
    players = detail.get('player_details', [])
    teams = detail.get('team_details', [])
    if not isinstance(players, list) or not isinstance(teams, list) or len(teams) != 2:
        return None
    if any(not isinstance(t, dict) or t.get('teamId') is None for t in teams):
        return None
    mine = next((p for p in players if isinstance(p, dict) and str(p.get('openid')) == str(account)), None)
    if mine is None or mine.get('teamId') is None:
        return None
    ids = [str(t['teamId']) for t in teams]
    my_id = str(mine['teamId'])
    if len(set(ids)) != 2 or my_id not in ids:
        return None
    return sorted(teams, key=lambda t: str(t['teamId']) != my_id)
