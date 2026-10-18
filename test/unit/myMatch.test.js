import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { generateTournament, setTournamentResult, resolveBracket } from '../../src/core/bracket.js';
import { generateLeague, setLeagueResult } from '../../src/core/league.js';
import { bracketSvg } from '../../src/render/svg.js';
import { pickPlayerByName, resolveSaved, playerSummaries } from '../../src/core/myMatch.js';

function sample(n = 8, opts = {}) {
  const st = createState();
  st.players = makePlayers(Array.from({ length: n }, (_, i) => `選手${i + 1}`));
  st.tables = [{ id: 't1', name: 'Aコート' }, { id: 't2', name: 'Bコート' }];
  const ids = st.players.map((p) => p.id);
  st.tournament = generateTournament(ids, opts);
  st.league = generateLeague(ids);
  return st;
}
const idOf = (st, name) => st.players.find((p) => p.name === name).id;
const play = (st, id, outcome = 'p1') => { st.tournament = setTournamentResult(st.tournament, id, { outcome }).tournament; };

test('名前で選ぶ: ちょうど一致する1人だけ。全角・半角、大文字・小文字、空白の違いは無視する', () => {
  const players = makePlayers(['山田 太郎', 'Ken Ａｂｅ', '佐藤 花子']);
  assert.equal(pickPlayerByName(players, '山田太郎'), players[0].id);
  assert.equal(pickPlayerByName(players, ' 山田　太郎 '), players[0].id);
  assert.equal(pickPlayerByName(players, 'ken abe'), players[1].id);
  assert.equal(pickPlayerByName(players, '山田'), null); // 部分一致では選ばない
  assert.equal(pickPlayerByName(players, ''), null);
  const dup = makePlayers(['同じ', '同じ']); // 同名が2人いるときは選べない
  assert.equal(pickPlayerByName(dup, '同じ'), null);
});

test('保存しておいた選択を、ID（なければ名前）で探す', () => {
  const players = makePlayers(['山田 太郎', '佐藤 花子']);
  assert.equal(resolveSaved(players, { id: players[1].id, name: '佐藤 花子' }), players[1].id);
  assert.equal(resolveSaved(players, { id: 'p-gone', name: '山田 太郎' }), players[0].id); // ID が変わっても、同じ名前の人
  assert.equal(resolveSaved(players, { id: 'p-gone', name: '誰か' }), null);
  assert.equal(resolveSaved(players, null), null);
  assert.equal(resolveSaved(players, 'x'), null);
});

test('トーナメント: 次に行う試合は、卓・時間帯・対戦相手・試合番号つき', () => {
  const st = sample(8);
  const s = playerSummaries(st, idOf(st, '選手1')).find((x) => x.kind === 'tournament');
  assert.equal(s.state, 'next');
  assert.equal(s.opponent, '選手8');
  assert.equal(s.no, 1);
  assert.equal(s.table, 'Aコート');
  assert.equal(s.timeSlot, 1);
  assert.equal(s.label, '準々決勝');
  const s5 = playerSummaries(st, idOf(st, '選手3')).find((x) => x.kind === 'tournament');
  assert.ok(s5.no > 1 && s5.opponent); // 別の試合
});

test('トーナメント: 勝ち残っていて対戦者が未定なら「未定」。勝つと次の試合が出る。負けると成績と敗退した回戦', () => {
  const st = sample(8);
  const a = idOf(st, '選手1');
  play(st, 'R1-M1'); // 選手1 勝ち
  let s = playerSummaries(st, a).find((x) => x.kind === 'tournament');
  assert.equal(s.state, 'waiting'); // 準決勝の相手が未定（隣の試合が終わっていない）
  assert.equal(s.label, '準決勝');
  assert.equal(s.opponent, '');
  play(st, 'R1-M2'); // 隣の試合が終わると、対戦者が決まる
  s = playerSummaries(st, a).find((x) => x.kind === 'tournament');
  assert.equal(s.state, 'next');
  assert.equal(s.label, '準決勝');
  assert.ok(s.opponent);
  // 負けた側
  const loser = idOf(st, '選手8');
  const l = playerSummaries(st, loser).find((x) => x.kind === 'tournament');
  assert.equal(l.state, 'finished');
  assert.equal(l.standing, '準々決勝敗退');
  assert.equal(l.record, '0勝1敗');
});

test('トーナメント: 3位決定戦に進む選手は、相手が決まるまで「未定」、決まれば3位決定戦が次。大会が終われば、優勝・準優勝の選手は順位つきで「finished」', () => {
  const st = sample(4, { thirdPlace: true });
  play(st, 'R1-M1');
  const loser = resolveBracket(st.tournament).rounds[0][0].loser;
  let s = playerSummaries(st, loser).find((x) => x.kind === 'tournament');
  assert.equal(s.state, 'waiting'); // もう一方の準決勝が終わるまで、3位決定戦の相手が決まらない
  assert.equal(s.label, '3位決定戦');
  play(st, 'R1-M2');
  s = playerSummaries(st, loser).find((x) => x.kind === 'tournament');
  assert.equal(s.state, 'next');
  assert.equal(s.label, '3位決定戦');
  assert.ok(s.opponent);
  play(st, 'R2-M1');
  play(st, '3P');
  const res = resolveBracket(st.tournament);
  const c = playerSummaries(st, res.champion).find((x) => x.kind === 'tournament');
  assert.equal(c.state, 'finished');
  assert.equal(c.standing, '優勝');
  const second = playerSummaries(st, res.rounds[1][0].loser).find((x) => x.kind === 'tournament');
  assert.equal(second.standing, '準優勝');
});

test('総当たり: 次に行う試合（その選手の中で最も早い回戦）。試合が全部終われば、成績と順位', () => {
  const st = sample(4);
  const a = idOf(st, '選手1');
  let s = playerSummaries(st, a).find((x) => x.kind === 'league');
  assert.equal(s.state, 'next');
  assert.equal(s.label, '1回戦');
  assert.equal(s.nowRound, true);
  assert.ok(s.opponent && s.no === 1 || s.no >= 1);
  for (const m of st.league.matches) st.league = setLeagueResult(st.league, m.id, { score1: 2, score2: 1, outcome: 'p1', walkover: false }, { allowDraw: true }).league;
  s = playerSummaries(st, a).find((x) => x.kind === 'league');
  assert.equal(s.state, 'finished');
  assert.match(s.record, /^\d勝(\d分)?\d敗$/);
  assert.match(s.standing, /^\d位$/);
});

test('総当たり: 自分の試合が次の回戦にあるとき（今の回戦は休み）は nowRound が false', () => {
  const st = sample(5); // 奇数人数: 各回戦に1人が休み
  const resting = st.players.find((p) => {
    const r1 = st.league.matches.filter((m) => m.round === 1);
    return !r1.some((m) => m.p1 === p.id || m.p2 === p.id);
  });
  const s = playerSummaries(st, resting.id).find((x) => x.kind === 'league');
  assert.equal(s.state, 'next');
  assert.equal(s.nowRound, false);
  assert.notEqual(s.label, '1回戦');
});

test('表にいない選手・表がない大会では、含めない', () => {
  const st = sample(4);
  st.league = null;
  const kinds = playerSummaries(st, st.players[0].id).map((x) => x.kind);
  assert.deepEqual(kinds, ['tournament']);
  assert.deepEqual(playerSummaries(st, 'p-none'), []);
  const none = createState();
  assert.deepEqual(playerSummaries(none, 'x'), []);
});

test('トーナメント表の SVG: 画面用（interactive）だけ選手の ID（data-pid）を持つ。PNG・印刷用は持たない', () => {
  const st = sample(4);
  const screen = bracketSvg(st, { interactive: true }).svg;
  const png = bracketSvg(st).svg;
  assert.ok(screen.includes(`data-pid="${st.players[0].id}"`));
  assert.ok(!png.includes('data-pid'));
});
