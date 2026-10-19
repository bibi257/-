import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { generateLeague, resolveLeague, setLeagueResult } from '../../src/core/league.js';
import { leagueRoundKeys, defaultLeagueRoundKey, restNames, playerOpponentRows } from '../../src/core/leagueRounds.js';

function make(n) {
  const st = createState();
  st.players = makePlayers(Array.from({ length: n }, (_, i) => `選手${i + 1}`));
  st.league = generateLeague(st.players.map((p) => p.id));
  return st;
}
const res = (st) => resolveLeague(st.league, st.tables);
const play = (st, id, input = { outcome: 'p1' }) => { st.league = setLeagueResult(st.league, id, input).league; };

test('回戦のタブ: 偶数人数は n-1 回戦、奇数人数は n 回戦', () => {
  assert.deepEqual(leagueRoundKeys(res(make(4))).map((k) => k.name), ['1回戦', '2回戦', '3回戦']);
  assert.deepEqual(leagueRoundKeys(res(make(5))).map((k) => k.name), ['1回戦', '2回戦', '3回戦', '4回戦', '5回戦']);
  assert.deepEqual(leagueRoundKeys(res(make(12))).length, 11);
  assert.deepEqual(leagueRoundKeys(res(make(2))), [{ key: '1', name: '1回戦' }]);
});

test('最初に開く回戦: 試合待ちがある最初の回戦。全部終われば最後の回戦', () => {
  const st = make(4);
  assert.equal(defaultLeagueRoundKey(res(st)), '1');
  for (const m of res(st).matches.filter((x) => x.round === 1)) play(st, m.id);
  assert.equal(defaultLeagueRoundKey(res(st)), '2');
  // 1回戦に未実施が1つでも残れば、1回戦のまま
  const st2 = make(4);
  const [first] = res(st2).matches.filter((x) => x.round === 1);
  play(st2, first.id);
  assert.equal(defaultLeagueRoundKey(res(st2)), '1');
  for (const m of res(st).matches) if (m.status === 'ready') play(st, m.id);
  assert.equal(defaultLeagueRoundKey(res(st)), '3');
});

test('休みの選手: 奇数人数の各回戦に1人。偶数人数は空', () => {
  const st = make(5);
  const all = leagueRoundKeys(res(st)).map((k) => restNames(st, res(st), k.key));
  assert.ok(all.every((r) => r.length === 1));
  assert.equal(new Set(all.flat()).size, 5); // 全員が1回ずつ休む
  const st4 = make(4);
  assert.deepEqual(restNames(st4, res(st4), '1'), []);
});

test('選手ごとの一覧: 対戦相手・回戦の順・マスと同じ表記。休みの回戦は入らない', () => {
  const st = make(4);
  const me = st.players[0].id;
  const rows = playerOpponentRows(st, me);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.round), [1, 2, 3]);
  assert.deepEqual(new Set(rows.map((r) => r.opponent)), new Set(['選手2', '選手3', '選手4']));
  assert.ok(rows.every((r) => r.outcome === null && r.text === ''));
  const m = rows[0].match;
  const iAmP1 = m.p1 === me;
  play(st, m.id, { score1: iAmP1 ? 3 : 1, score2: iAmP1 ? 1 : 3 });
  let got = playerOpponentRows(st, me)[0];
  assert.equal(got.outcome, 'win');
  assert.equal(got.text, '○ 3-1');
  // 相手の側から見ると、同じ試合は ×・スコアは自分が先
  const opp = playerOpponentRows(st, got.opponentId).find((r) => r.match.id === m.id);
  assert.equal(opp.outcome, 'loss');
  assert.equal(opp.text, '× 1-3');
  // 5人の総当たり: 1人は4試合（1回は休み）
  const st5 = make(5);
  assert.equal(playerOpponentRows(st5, st5.players[0].id).length, 4);
});

test('選手ごとの一覧: 引き分け・不戦勝・不戦敗。総当たりが無い・表にいない選手は空', () => {
  const st = make(3);
  st.settings.league.allowDraw = true;
  const me = st.players[0].id;
  const [a, b] = playerOpponentRows(st, me);
  play(st, a.match.id, { outcome: 'draw', score1: 2, score2: 2 });
  play(st, b.match.id, { walkover: true, outcome: b.match.p1 === me ? 'p1' : 'p2' });
  const rows = playerOpponentRows(st, me);
  assert.equal(rows[0].outcome, 'draw');
  assert.equal(rows[0].text, '△ 2-2');
  assert.equal(rows[1].outcome, 'win');
  assert.equal(rows[1].text, '○ 不戦勝');
  assert.equal(playerOpponentRows(st, 'nobody').length, 0);
  assert.deepEqual(playerOpponentRows(createState(), me), []);
});
