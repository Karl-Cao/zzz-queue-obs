"""Akari-inspired single-match team performance, never a matchmaking Elo.

Formula port: LeagueAkari player/scoring.ts, single/akari.ts, single/summary.ts.
See third_party/LeagueAkari-LICENSE.txt. WeGame field adapter and missing-data
policy are ours. Missing components are omitted for BOTH teams; no zero fill.
Scores are means of player scores / available maximum, not inferred skill.
"""
from dataclasses import dataclass
from math import isfinite, sqrt


@dataclass(frozen=True)
class TeamPerformance:
    score: float
    maximum: int
    components: tuple[str, ...]

    @property
    def label(self) -> str:
        return f'表现估算 {self.score:.1f}/{self.maximum}'


def number(value):
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        return None
    try:
        result = float(value)
    except (ValueError, OverflowError):
        return None
    return result if isfinite(result) and result >= 0 else None


def read(player, *keys):
    for key in keys:
        if key in player:
            return number(player[key])
    return None


def linear(value, lower, upper, weight):
    return (min(max(value, lower), upper) - lower) / (upper - lower) * weight


def adapt(player):
    cs = read(player, 'allMinionsKilled')
    if cs is None:
        lane = read(player, 'minionsKilled')
        jungle = read(player, 'neutralMinionsKilled')
        if lane is not None and jungle is not None:
            cs = lane + jungle
    return {
        'k': read(player, 'championsKilled'), 'd': read(player, 'numDeaths'),
        'a': read(player, 'assists'),
        'damage': read(player, 'totalDamageToChampions', 'totalDamageDealtToChampions'),
        'taken': read(player, 'totalDamageTaken'), 'gold': read(player, 'goldEarned'),
        'vision': read(player, 'visionScore'), 'cs': cs,
        # totalHealth is not silently equated to totalHeal without verification.
        'heal': read(player, 'totalHeal'),
    }


def estimate_team_performance(detail: dict, team_id) -> TeamPerformance | None:
    if detail.get('map_id') is not None and str(detail['map_id']) not in ('11', '12'):
        return None
    players = detail.get('player_details')
    teams = detail.get('team_details')
    if not isinstance(players, list) or not isinstance(teams, list) or not players:
        return None
    if any(not isinstance(p, dict) or p.get('teamId') is None for p in players):
        return None
    grouped = {}
    for player in players:
        grouped.setdefault(str(player['teamId']), []).append(adapt(player))
    if len(grouped) != 2 or any(len(group) < 2 for group in grouped.values()):
        return None  # No solo/Arena/PvE interpretation as a two-team score.
    team = next((t for t in teams if isinstance(t, dict) and str(t.get('teamId')) == str(team_id)), None)
    members = grouped.get(str(team_id))
    if team is None or members is None:
        return None
    rows = [p for group in grouped.values() for p in group]
    if any(p[key] is None for p in rows for key in ('k', 'd', 'a')):
        return None
    if any(p[key] != int(p[key]) for p in rows for key in ('k', 'd', 'a')):
        return None
    weights = {'kda': 1, 'participation': 2}
    # Component coverage is shared across the match for fair team comparison.
    for field, weight in [('damage', 3), ('taken', 2), ('gold', 2), ('vision', 2)]:
        if all(p[field] is not None for p in rows):
            weights[field] = weight
    if all(p['heal'] is not None and p['taken'] is not None for p in rows):
        weights['heal'] = 2
    duration = number(detail.get('game_time_played'))  # WeGame supplies seconds.
    if duration and all(p['cs'] is not None for p in rows):
        weights['cs'] = 2
    outcomes = {str(t.get('teamId')): t.get('win') for t in teams if isinstance(t, dict)}
    if all(outcomes.get(key) in ('Win', 'Fail', 'Lose', 'Loss') for key in grouped):
        weights['win'] = 1
    count = len(members)
    total_kills = sum(p['k'] for p in members)
    totals = {field: sum(p[field] for p in members) for field in ('damage', 'taken', 'gold', 'vision') if field in weights}
    score = 0.0
    for p in members:
        kda = (p['k'] + p['a']) / max(p['d'], 1)
        value = min(sqrt(max(kda - 2, 0)) * 3 / 7, 1)
        value += linear((p['k'] + p['a']) / (total_kills or 1), .3, 1, 2)
        for field in totals:
            ratio = p[field] / (totals[field] or 1) * count
            value += linear(ratio, 1, 1.5 if field == 'gold' else 2, weights[field])
        if 'heal' in weights:
            total_taken = sum(m['taken'] for m in members)
            value += linear(p['heal'] / ((total_taken / count) or 1), .2, 1.4, 2)
        if 'cs' in weights:
            value += linear(p['cs'] / (duration / 60), 5, 10, 2)
        if 'win' in weights:
            value += 1 if outcomes[str(team_id)] == 'Win' else 0
        score += value
    return TeamPerformance(score / count, sum(weights.values()), tuple(weights))


def format_team_performance(detail: dict, team: dict) -> str:
    rating = estimate_team_performance(detail, team.get('teamId'))
    return rating.label if rating is not None else '表现估算：数据不足'


def draw_team_performance_panel(size, detail, team, font, side=None):
    """Replace the old baked-in Elo label, fitting the existing panel bounds."""
    from PIL import Image, ImageDraw
    panel = Image.new('RGBA', size, (25, 32, 51, 255))
    draw = ImageDraw.Draw(panel)
    label = format_team_performance(detail, team)
    if side:
        label = f'{side} · {label}'
    heading = font(20)
    for point in range(20, 10, -1):
        heading = font(point)
        if draw.textlength(label, font=heading) <= size[0] - 16:
            break
    draw.text((8, 20), label, fill='white', font=heading, anchor='lm')
    gold = number(team.get('totalGoldEarned'))
    draw.text((8, 55), f'经济 {int(gold)}' if gold is not None else '经济：未提供', fill='#b8c7da', font=font(20), anchor='lm')
    return panel
