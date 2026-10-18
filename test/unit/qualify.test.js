import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startNextEdition, currentEdition } from '../../src/core/edition.js';
import { createState } from '../../src/core/state.js';
import { generateLeague, setLeagueResult } from '../../src/core/league.js';
import { generateTournament } from '../../src/core/bracket.js';

function leagueState(n, { finish = true, tie = false } = {}) {
  const st = createState();
  st.meta.title = '予選';
  st.players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `選手${i + 1}` }));
  st.settings = { ...st.settings, seedCount: 2 };
  let l = generateLeague(st.players.map((p) => p.id));
  const idx = (id) => Number(id.slice(1));
  l.matches.forEach((m, i) => {
    if (!finish && i > 0) return;
    // 番号の小さい選手が勝つ。tie のときは選手3以降の対戦を引き分けにして同順位を作る
    const draw = tie && idx(m.p1) >= 3 && idx(m.p2) >= 3;
    const [a, b] = draw ? [1, 1] : idx(m.p1) < idx(m.p2) ? [1, 0] : [0, 1];
    l = setLeagueResult(l, m.id, { score1: a, score2: b }, { allowDraw: true }).league;
  });
  return { ...st, league: l };
}

test('上位N人で次の回: 順位順の名簿になり、前の回は残り、表と結果は空になる', () => {
  const st = leagueState(6);
  const r = startNextEdition(st, { topCount: 4 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.players.map((p) => p.name), ['選手1', '選手2', '選手3', '選手4']);
  assert.equal(r.state.tournament, null);
  assert.equal(r.state.league, null);
  assert.equal(currentEdition(r.state), 2);
  assert.equal(r.state.history.length, 1);
  assert.equal(r.state.history[0].players.length, 6); // 前の回の名簿は6人のまま
  assert.equal(r.tie, null);
});

test('上位N人で次の回: 名簿は順位順（勝点の多い順）。名簿の元の並びではなく順位で並ぶ', () => {
  const st = leagueState(4);
  st.players = [...st.players].reverse(); // 名簿の並びを逆にしても順位は変わらない
  const r = startNextEdition(st, { topCount: 3 });
  assert.deepEqual(r.state.players.map((p) => p.name), ['選手1', '選手2', '選手3']);
});

test('上位N人で次の回: 参加者のIDは引き継ぐ（名前だけの別人にならない）', () => {
  const st = leagueState(4);
  const r = startNextEdition(st, { topCount: 2 });
  assert.deepEqual(r.state.players.map((p) => p.id), ['p1', 'p2']);
});

test('上位N人で次の回: 境目に同順位がいるときは tie で知らせる（名簿順で選ぶ）', () => {
  const st = leagueState(6, { tie: true });
  // 選手3〜6は互いに引き分け → 3位が4人。上位4人だと境目（4位）に同順位が残る
  const r = startNextEdition(st, { topCount: 4 });
  assert.equal(r.ok, true);
  assert.equal(r.state.players.length, 4);
  assert.deepEqual(r.tie, { rank: 3, total: 4 });
  // 上位2人なら境目に同順位は無い
  assert.equal(startNextEdition(st, { topCount: 2 }).tie, null);
});

test('上位N人で次の回: 人数の範囲・総当たりが無い場合はエラー', () => {
  const st = leagueState(4);
  assert.match(startNextEdition(st, { topCount: 1 }).error, /2〜4/);
  assert.match(startNextEdition(st, { topCount: 5 }).error, /2〜4/);
  assert.match(startNextEdition(st, { topCount: 2.5 }).error, /2〜4/);
  const onlyT = { ...st, league: null, tournament: generateTournament(st.players.map((p) => p.id)) };
  assert.match(startNextEdition(onlyT, { topCount: 2 }).error, /総当たり/);
});

test('上位N人で次の回: 途中でも始められる（順位は途中経過）。topCount 指定なしは従来どおり全員を引き継ぐ', () => {
  const st = leagueState(4, { finish: false });
  assert.equal(startNextEdition(st, { topCount: 2 }).ok, true);
  const all = startNextEdition(st);
  assert.equal(all.ok, true);
  assert.equal(all.state.players.length, 4);
});

test('上位N人で次の回: 名簿から削除済みの選手は選ばない', () => {
  const st = leagueState(5);
  st.players = st.players.filter((p) => p.id !== 'p1'); // 1位の選手を名簿から削除
  const r = startNextEdition(st, { topCount: 2 });
  assert.deepEqual(r.state.players.map((p) => p.id), ['p2', 'p3']);
  assert.match(startNextEdition(st, { topCount: 5 }).error, /2〜4/);
});
