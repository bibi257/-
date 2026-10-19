import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { generateTournament, resolveBracket, setTournamentResult } from '../../src/core/bracket.js';
import { generateLeague, resolveLeague, setLeagueResult } from '../../src/core/league.js';
import { setAbsent } from '../../src/core/attendance.js';
import { reportTargets, checkReport, reportText, reportStatus, applyReport } from '../../src/core/report.js';

function sample(n = 4) {
  const st = createState();
  st.players = makePlayers(Array.from({ length: n }, (_, i) => `選手${i + 1}`));
  const ids = st.players.map((p) => p.id);
  st.tournament = generateTournament(ids, { seedCount: 0, shuffle: false });
  st.league = generateLeague(ids);
  return st;
}
const firstReady = (st) => resolveBracket(st.tournament, st.tables).playable.find((m) => m.status === 'ready');

test('報告できる試合: 対戦者が決まっていて結果が無い試合だけ（トーナメントと総当たり）', () => {
  const st = sample(4);
  const t = reportTargets(st).filter((x) => x.kind === 'tournament');
  assert.equal(t.length, 2); // 準決勝2試合。決勝はまだ対戦者が未定
  const m = firstReady(st);
  const done = setTournamentResult(st.tournament, m.id, { outcome: 'p1' }).tournament;
  const after = reportTargets({ ...st, tournament: done }).filter((x) => x.kind === 'tournament');
  assert.equal(after.length, 1);
  assert.equal(reportTargets(st).filter((x) => x.kind === 'league').length, 6);
});

test('報告の検査: スコアと勝者の矛盾・勝者もスコアも無い・トーナメントの引き分けを弾く', () => {
  const st = sample(4);
  const m = firstReady(st);
  assert.deepEqual(checkReport(st, { matchId: m.id, outcome: 'p2', score1: 3, score2: 1 }).ok, false);
  assert.equal(checkReport(st, { matchId: m.id }).ok, false);
  assert.equal(checkReport(st, { matchId: m.id, outcome: 'draw' }).ok, false);
  assert.equal(checkReport(st, { matchId: 'nothing', outcome: 'p1' }).ok, false);
  const ok = checkReport(st, { matchId: m.id, score1: '3', score2: '1' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.report, { matchId: m.id, outcome: 'p1', score1: 3, score2: 1, p1: m.p1, p2: m.p2 });
});

test('報告の検査: 総当たりの引き分けは、設定で許したときだけ', () => {
  const st = sample(3);
  const lm = resolveLeague(st.league, st.tables).matches[0];
  st.settings.league.allowDraw = false;
  assert.equal(checkReport(st, { matchId: lm.id, outcome: 'draw' }).ok, false);
  st.settings.league.allowDraw = true;
  assert.equal(checkReport(st, { matchId: lm.id, outcome: 'draw' }).ok, true);
});

test('承認: トーナメントの結果が入り、勝者が次の試合へ進む', () => {
  const st = sample(4);
  const m = firstReady(st);
  const rep = checkReport(st, { matchId: m.id, outcome: 'p2', score1: 1, score2: 3 }).report;
  assert.equal(reportStatus(st, rep).ok, true);
  const out = applyReport(st, rep);
  assert.equal(out.ok, true);
  const res = resolveBracket(out.state.tournament, out.state.tables);
  const got = res.matches.find((x) => x.id === m.id);
  assert.equal(got.status, 'done');
  assert.equal(got.winner, m.p2);
  assert.equal(st.tournament.results[m.id], undefined); // 元の状態は変えない
  assert.ok(res.matches.some((x) => x.round === 2 && (x.p1 === m.p2 || x.p2 === m.p2)));
});

test('承認: 総当たりの結果が入る', () => {
  const st = sample(3);
  const lm = resolveLeague(st.league, st.tables).matches[0];
  const rep = checkReport(st, { matchId: lm.id, outcome: 'p1', score1: 2, score2: 0 }).report;
  const out = applyReport(st, rep);
  assert.equal(out.ok, true);
  assert.equal(out.state.league.results[lm.id].outcome, 'p1');
  assert.equal(out.state.league.results[lm.id].score1, 2);
});

test('承認: 先に運営が結果を入れた試合は承認できない（上書きしない）', () => {
  const st = sample(4);
  const m = firstReady(st);
  const rep = checkReport(st, { matchId: m.id, outcome: 'p1' }).report;
  const entered = { ...st, tournament: setTournamentResult(st.tournament, m.id, { outcome: 'p2' }).tournament };
  const status = reportStatus(entered, rep);
  assert.equal(status.ok, false);
  assert.match(status.error, /すでに結果/);
  assert.equal(applyReport(entered, rep).ok, false);
  assert.equal(entered.tournament.results[m.id].winnerId, m.p2); // 運営の入力が残る
});

test('承認: 対戦者が変わった試合・表から消えた試合は承認できない', () => {
  const st = sample(4);
  const m = firstReady(st);
  const rep = checkReport(st, { matchId: m.id, outcome: 'p1' }).report;
  assert.equal(applyReport(st, { ...rep, p1: m.p2, p2: m.p1 }).ok, false); // 対戦者が違う
  assert.match(applyReport(st, { ...rep, p1: m.p2, p2: m.p1 }).error, /対戦者が変わった/);
  const gone = applyReport({ ...st, tournament: null, league: null }, rep);
  assert.equal(gone.ok, false);
  assert.match(gone.error, /表にありません/);
});

test('承認: 欠席で不戦にすると決めた選手の次の試合は、続けて不戦になる', () => {
  const st = sample(8);
  const absent = st.players[7].id; // 最後の選手を欠席にする
  st.players = setAbsent(st.players, absent, true);
  st.tournament = generateTournament(st.players.map((p) => p.id), { seedCount: 0, shuffle: false });
  st.tournament = { ...st.tournament, walkoverIds: [absent] };
  const m = firstReady(st);
  const rep = checkReport(st, { matchId: m.id, outcome: 'p1' }).report;
  const out = applyReport(st, rep);
  assert.equal(out.ok, true);
  assert.equal(typeof out.settled, 'number');
});

test('報告の説明文: 勝者とスコアが読める。引き分けも', () => {
  const st = sample(4);
  const m = firstReady(st);
  const a = st.players.find((p) => p.id === m.p1).name;
  const b = st.players.find((p) => p.id === m.p2).name;
  assert.equal(reportText(st, { matchId: m.id, outcome: 'p2', score1: 1, score2: 3, p1: m.p1, p2: m.p2 }), `${a} 1 - 3 ${b}　${b}の勝ち`);
  assert.equal(reportText(st, { matchId: m.id, outcome: 'p1', score1: null, score2: null, p1: m.p1, p2: m.p2 }), `${a} vs ${b}　${a}の勝ち`);
  assert.match(reportText(st, { matchId: m.id, outcome: 'draw', score1: 2, score2: 2, p1: m.p1, p2: m.p2 }), /引き分け/);
});
