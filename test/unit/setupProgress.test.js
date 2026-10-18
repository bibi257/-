import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupProgress, makePlayers } from '../../src/core/players.js';
import { createState } from '../../src/core/state.js';
import { generateTournament } from '../../src/core/bracket.js';
import { generateLeague } from '../../src/core/league.js';

const withPlayers = (n) => ({ ...createState(), players: makePlayers(Array.from({ length: n }, (_, i) => `選手${i + 1}`)) });

test('参加者が0人・1人のときは「1 大会情報と参加者」が済みにならない', () => {
  assert.deepEqual(setupProgress(withPlayers(0)), { players: false, created: false });
  assert.deepEqual(setupProgress(withPlayers(1)), { players: false, created: false });
});

test('参加者が2人以上で「1」が済みになる。表がなければ「3」は未了', () => {
  assert.deepEqual(setupProgress(withPlayers(2)), { players: true, created: false });
  assert.deepEqual(setupProgress(withPlayers(12)), { players: true, created: false });
});

test('トーナメントか総当たりを作成すると「3」が済みになる', () => {
  const st = withPlayers(4);
  const ids = st.players.map((p) => p.id);
  assert.equal(setupProgress({ ...st, tournament: generateTournament(ids, st.settings) }).created, true);
  assert.equal(setupProgress({ ...st, league: generateLeague(ids) }).created, true);
});
