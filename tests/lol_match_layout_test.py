import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('match_layout', Path(__file__).resolve().parents[1] / 'qq/core_extensions/public_lol_bridge/match_layout.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)


class MatchLayoutTest(unittest.TestCase):
    def test_query_team_first_for_both_sides_and_results(self):
        for side in (100,200):
            for wins in ('Win','Fail'):
                for api_order in ([100,200],[200,100]):
                    data = {'team_details':[{'teamId':str(i),'win': wins if i==side else 'Win', 'totalGoldEarned':i*10} for i in api_order], 'player_details':[{'openid':'queried','teamId':side}]}
                    ordered = module.ordered_match_teams(data,'queried')
                    self.assertEqual([str(t['teamId']) for t in ordered],[str(side),str(300-side)])
                    self.assertEqual(ordered[0]['totalGoldEarned'], side*10)
                    self.assertEqual([t['teamId'] for t in data['team_details']],[str(i) for i in api_order])

    def test_does_not_guess_query_side(self):
        data = {'team_details':[{'teamId':'100'},{'teamId':'200'}], 'player_details':[{'openid':'other','teamId':'100'}]}
        self.assertIsNone(module.ordered_match_teams(data,'queried'))
        data['player_details'] = [{'openid':'queried','teamId':'300'}]
        self.assertIsNone(module.ordered_match_teams(data,'queried'))

    def test_invalid_teams_do_not_produce_misaligned_rows(self):
        for teams in ([],[{'teamId':'100'}],[{'teamId':'100'},{'teamId':'100'}],[{},{}]):
            self.assertIsNone(module.ordered_match_teams({'team_details':teams,'player_details':[]},'queried'))
