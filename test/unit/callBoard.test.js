import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { generateTournament, setTournamentResult, THIRD_PLACE_ID } from '../../src/core/bracket.js';
import { generateLeague, setLeagueResult } from '../../src/core/league.js';
import { callBoard } from '../../src/core/callBoard.js';

function sample(n, opts = {}) {
  const st = createState();
  st.meta.title = '春季大会';
  st.players = makePlayers(Array.from({ length: n }, (_, i) => `選手${i + 1}`));
  st.tables = [{ id: 't1', name: 'Aコート' }, { id: 't2', name: 'Bコート' }];
  st.tournament = generateTournament(st.players.map((p) => p.id), opts);
  st.league = generateLeague(st.players.map((p) => p.id));
  return st;
}

test('トーナメント: 次に行う試合を番号順に、卓・時間帯・対戦者つきで返す', () => {
  const st = sample(4);
  const b = callBoard(st, 'tournament');
  assert.equal(b.kind, 'tournament');
  assert.equal(b.title, '春季大会');
  assert.equal(b.done, 0);
  assert.equal(b.total, 3);
  assert.equal(b.finished, false);
  assert.equal(b.items.length, 2);
  assert.deepEqual(b.items.map((x) => x.no), [1, 2]);
  assert.equal(b.items[0].label, '準決勝');
  assert.equal(b.items[0].table, 'Aコート');
  assert.equal(b.items[1].table, 'Bコート');
  assert.equal(b.items[0].timeSlot, 1);
  assert.equal(b.items[0].p1, '選手1');
  assert.equal(b.items[0].p2, '選手4');
});

test('トーナメント: 結果が入ると進行が進み、決勝が出る。終われば優勝者を返す', () => {
  const st = sample(4);
  let t = st.tournament;
  t = setTournamentResult(t, 'R1-M1', { score1: 3, score2: 0 }).tournament;
  st.tournament = t;
  let b = callBoard(st, 'tournament');
  assert.equal(b.done, 1);
  assert.deepEqual(b.items.map((x) => x.no), [2]);
  t = setTournamentResult(t, 'R1-M2', { score1: 1, score2: 2 }).tournament;
  st.tournament = t;
  b = callBoard(st, 'tournament');
  assert.equal(b.items[0].label, '決勝');
  t = setTournamentResult(t, 'R2-M1', { score1: 2, score2: 1 }).tournament;
  st.tournament = t;
  b = callBoard(st, 'tournament');
  assert.equal(b.finished, true);
  assert.equal(b.items.length, 0);
  assert.equal(b.champion, '選手1');
});

test('トーナメント: 3位決定戦のラベル。表が無いときは none', () => {
  const st = sample(4, { thirdPlace: true });
  let t = st.tournament;
  t = setTournamentResult(t, 'R1-M1', { score1: 1, score2: 0 }).tournament;
  t = setTournamentResult(t, 'R1-M2', { score1: 1, score2: 0 }).tournament;
  st.tournament = t;
  const labels = callBoard(st, 'tournament').items.map((x) => x.label).sort();
  assert.deepEqual(labels, ['3位決定戦', '決勝']);
  st.tournament = null;
  assert.equal(callBoard(st, 'tournament').kind, 'none');
});

test('総当たり: 次の回戦の試合と休みの選手を返す。全試合終了で finished', () => {
  const st = sample(5);
  let b = callBoard(st, 'league');
  assert.equal(b.kind, 'league');
  assert.equal(b.total, 10);
  assert.equal(b.items.length, 2); // 5人 → 1回戦は2試合
  assert.equal(b.items[0].label, '1回戦');
  assert.equal(b.rest.length, 1);
  assert.equal(b.finished, false);
  for (const m of st.league.matches) {
    st.league = setLeagueResult(st.league, m.id, { score1: 1, score2: 0 }).league;
  }
  b = callBoard(st, 'league');
  assert.equal(b.finished, true);
  assert.equal(b.done, 10);
  assert.equal(b.items.length, 0);
});

test('名前を変えても呼び出し画面に反映される（ID参照）', () => {
  const st = sample(4);
  st.players[0].name = '山田 太郎';
  assert.equal(callBoard(st, 'tournament').items[0].p1, '山田 太郎');
});

test('過去の回があるときは大会名に第N回が付く', () => {
  const st = sample(4);
  st.history = [{ edition: 1, title: '春季大会', archivedAt: '2026-01-01T00:00:00.000Z', players: [], tables: [], settings: st.settings, tournament: null, league: null }];
  assert.equal(callBoard(st, 'tournament').title, '春季大会 第2回');
});

test('トーナメント: 終われば準優勝と3位も返す（3位決定戦なしは準決勝の敗者2人）。途中は空', () => {
  const st = sample(4);
  let t = st.tournament;
  t = setTournamentResult(t, 'R1-M1', { score1: 3, score2: 0 }).tournament;
  t = setTournamentResult(t, 'R1-M2', { score1: 1, score2: 2 }).tournament;
  st.tournament = t;
  let b = callBoard(st, 'tournament');
  assert.equal(b.runnerUp, '');
  assert.deepEqual(b.thirds, []);
  t = setTournamentResult(t, 'R2-M1', { score1: 2, score2: 1 }).tournament;
  st.tournament = t;
  b = callBoard(st, 'tournament');
  assert.equal(b.champion, '選手1');
  assert.equal(b.runnerUp, '選手3');
  assert.deepEqual([...b.thirds].sort(), ['選手2', '選手4']);
});

test('トーナメント: 3位決定戦があるときは、その終了まで表彰が出ず、3位は勝者1人', () => {
  const st = sample(4, { thirdPlace: true });
  let t = st.tournament;
  for (const [id, a, b2] of [['R1-M1', 3, 0], ['R1-M2', 1, 2], ['R2-M1', 2, 1]]) t = setTournamentResult(t, id, { score1: a, score2: b2 }).tournament;
  st.tournament = t;
  let b = callBoard(st, 'tournament');
  assert.equal(b.finished, false);
  assert.equal(b.runnerUp, '');
  t = setTournamentResult(t, THIRD_PLACE_ID, { score1: 0, score2: 1 }).tournament;
  st.tournament = t;
  b = callBoard(st, 'tournament');
  assert.equal(b.finished, true);
  assert.equal(b.runnerUp, '選手3');
  assert.equal(b.thirds.length, 1);
});
