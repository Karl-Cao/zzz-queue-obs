Scoring adapted from LeagueAkari (MIT, Copyright (c) 2026 Hanxven).
Source revision: 5109b2f7fcce6e02312e534cd1729ed0f2142b51
https://github.com/LeagueAkari/LeagueAkari/tree/5109b2f7fcce6e02312e534cd1729ed0f2142b51
Reference files: src/shared/data-adapter/analysis/player/scoring.ts,
constants.ts, single/akari.ts, single/summary.ts, and analysis/team/index.ts.
Local adaptation uses WeGame single-match field names, excludes unavailable
components equally for both teams, and averages player scores. The denominator
is the sum of available component maxima, not always Akari's full 17 points.
It is not LeagueAkari's multi-match aggregate analysis and not matchmaking Elo.
MIT license retained in LeagueAkari-LICENSE.txt.
