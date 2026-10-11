import importlib.util
import unittest
from pathlib import Path

source=Path(__file__).resolve().parents[1]/'qq/core_extensions/public_lol_bridge/team_rating.py'
spec=importlib.util.spec_from_file_location('team_rating',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)


class TeamRatingTest(unittest.TestCase):
    def test_real_values_are_displayed(self):
        for value,expected in [(2300,'2300'),('2300','2300'),(2300.5,'2300.5'),(' 2300.50 ','2300.5')]:
            self.assertEqual(module.format_team_elo({'teamElo':value}),expected)
    def test_missing_or_invalid_values_are_not_invented(self):
        for value in [None,0,-1,True,False,'','hidden','NaN','Infinity',float('nan'),{},[],1e20]:
            self.assertEqual(module.format_team_elo({'teamElo':value}),'未提供')
        self.assertEqual(module.format_team_elo({}),'未提供')
    def test_performance_and_current_rank_are_not_used_as_elo(self):
        self.assertEqual(module.format_team_elo({'akariScore':88,'tier':3,'rankScore':1200}),'未提供')
    def test_two_teams_keep_their_individual_values(self):
        teams=[{'teamElo':2200},{'teamElo':2400}]
        self.assertEqual([module.format_team_elo(t) for t in teams],['2200','2400'])
