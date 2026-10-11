import importlib.util
from pathlib import Path
import sys
import unittest
from copy import deepcopy

spec = importlib.util.spec_from_file_location('team_performance', Path(__file__).resolve().parents[1] / 'qq/core_extensions/public_lol_bridge/team_performance.py')
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def fixture():
    players = []
    for team_id in ('100', '200'):
        for i in range(5):
            players.append(dict(teamId=team_id, championsKilled=2, numDeaths=2, assists=4,
                                totalDamageToChampions=10000, totalDamageTaken=10000,
                                goldEarned=10000, visionScore=10, allMinionsKilled=200,
                                totalHeal=2000))
    return dict(player_details=players, team_details=[dict(teamId='100', win='Win'), dict(teamId='200', win='Fail')], game_time_played=1200, map_id=11)


class TeamPerformanceTest(unittest.TestCase):
    def test_reference_formula_for_equal_contribution(self):
        # KDA=3 => 3/7; participation=.6 => 6/7; CS=10/min =>2.
        # Expected-contribution ratio=1 =>0; healing=.2=>0; win=>1.
        data = fixture()
        first = module.estimate_team_performance(data, '100')
        second = module.estimate_team_performance(data, 200)
        self.assertAlmostEqual(first.score, 3/7 + 6/7 + 2 + 1)
        self.assertAlmostEqual(first.score - second.score, 1)
        self.assertEqual(first.maximum, 17)

    def test_missing_field_excluded_for_both_teams(self):
        data = fixture()
        del data['player_details'][0]['totalHeal']
        for team in ('100', '200'):
            result = module.estimate_team_performance(data, team)
            self.assertEqual(result.maximum, 15)
            self.assertNotIn('heal', result.components)

    def test_missing_core_data_is_not_invented(self):
        for value in (None, 'broken', -1, True, float('nan'), float('inf'), 2.5):
            data = fixture(); data['player_details'][0]['championsKilled'] = value
            self.assertIsNone(module.estimate_team_performance(data, '100'))

    def test_zero_deaths_and_zero_totals_are_finite(self):
        data = fixture()
        for p in data['player_details']:
            for k in list(p):
                if k != 'teamId': p[k] = 0
        result = module.estimate_team_performance(data, '100')
        self.assertEqual(result.score, 1)

    def test_cs_adapter_does_not_double_count(self):
        p = dict(allMinionsKilled=200, minionsKilled=180, neutralMinionsKilled=20)
        self.assertEqual(module.adapt(p)['cs'], 200)
        del p['allMinionsKilled']
        self.assertEqual(module.adapt(p)['cs'], 200)

    def test_unsupported_modes_and_missing_duration(self):
        data = fixture(); data['map_id'] = 30
        self.assertIsNone(module.estimate_team_performance(data, '100'))
        data = fixture(); del data['game_time_played']
        result = module.estimate_team_performance(data, '100')
        self.assertNotIn('cs', result.components)

    def test_one_players_contribution_is_not_team_total(self):
        data = fixture(); data['player_details'][0]['totalDamageToChampions'] = 40000
        result = module.estimate_team_performance(data, '100')
        # first player ratio=2.5 (capped at3 pts), remaining ratios=.625=>0
        self.assertAlmostEqual(result.score, module.estimate_team_performance(fixture(), '100').score + .6)

    def test_no_false_totalhealth_mapping_or_side_effects(self):
        data = fixture(); original = deepcopy(data)
        module.estimate_team_performance(data, '100')
        self.assertEqual(data, original)
        self.assertIsNone(module.adapt({'totalHealth':10000})['heal'])
        self.assertIn('表现估算', module.format_team_performance(data, data['team_details'][0]))


if __name__ == '__main__':
    unittest.main()
