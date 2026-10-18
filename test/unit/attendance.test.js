import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, parseState, serializeState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { generateTournament, resolveBracket, tournamentRanking, setTournamentResult } from '../../src/core/bracket.js';
import { generateLeague, resolveLeague, leagueStandings } from '../../src/core/league.js';
import {
  attendanceCount, presentPlayers, setAbsent, allPresent, absenceImpact,
  applyTournamentWalkovers, applyLeagueWalkovers, applyWalkovers, settleWalkovers, stopWalkover,
} from '../../src/core/attendance.js';
import { planSeeds } from '../../src/core/seeds.js';
import { startNextEdition, editionState } from '../../src/core/edition.js';

function sample(n = 8) {
  const st = createState();
  st.players = makePlayers(Array.from({ length: n }, (_, i) => `選手${i + 1}`));
  return st;
}
const ids = (st) => st.players.map((p) => p.id);

test('出欠: 初期値は全員出席。欠席にする・戻す・全員出席にする。欠席でない選手は absent を持たない', () => {
  const st = sample(4);
  assert.deepEqual(attendanceCount(st.players), { total: 4, present: 4, absent: 0 });
  let players = setAbsent(st.players, st.players[1].id, true);
  assert.equal(players[1].absent, true);
  assert.deepEqual(attendanceCount(players), { total: 4, present: 3, absent: 1 });
  assert.deepEqual(presentPlayers(players).map((p) => p.name), ['選手1', '選手3', '選手4']);
  assert.equal(st.players[1].absent, undefined); // 元の名簿は変えない
  players = setAbsent(players, st.players[1].id, false);
  assert.equal('absent' in players[1], false);
  players = setAbsent(setAbsent(players, st.players[0].id, true), st.players[2].id, true);
  assert.equal(attendanceCount(players).absent, 2);
  assert.equal(attendanceCount(allPresent(players)).absent, 0);
  assert.equal(allPresent(players).some((p) => 'absent' in p), false);
});

test('保存・読込: 欠席は残り、古い形式（absent なし）は全員出席として読む', () => {
  const st = sample(4);
  st.players = setAbsent(st.players, st.players[2].id, true);
  const back = parseState(serializeState(st));
  assert.ok(back.ok, back.error);
  assert.deepEqual(back.state.players.map((p) => p.absent === true), [false, false, true, false]);
  assert.equal('absent' in back.state.players[0], false);
  const old = parseState(serializeState(sample(3)));
  assert.equal(attendanceCount(old.state.players).absent, 0);
  // true 以外の値は欠席にしない
  const odd = JSON.parse(serializeState(sample(3)));
  odd.players[0].absent = 'yes';
  assert.equal(parseState(JSON.stringify(odd)).state.players[0].absent, undefined);
});

test('欠席者を除いて作る: シードの指名・ランダムも出席者だけで決まる', () => {
  const st = sample(6);
  st.players = setAbsent(st.players, st.players[0].id, true);
  const present = presentPlayers(st.players);
  const pick = planSeeds(present, { seedMode: 'pick', seedIds: [st.players[0].id, st.players[1].id], seedCount: 0 });
  assert.deepEqual(pick.playerIds.slice(0, 1), [st.players[1].id]); // 欠席の指名は外れる
  assert.equal(pick.seedCount, 1);
  assert.equal(pick.playerIds.includes(st.players[0].id), false);
  const rnd = planSeeds(present, { seedMode: 'random', seedCount: 2 });
  assert.equal(rnd.playerIds.length, 5);
  assert.equal(rnd.playerIds.includes(st.players[0].id), false);
});

test('トーナメントで、欠席者が出る試合を不戦（相手の不戦勝）にする。勝ち上がった先の試合は残る', () => {
  const st = sample(8);
  const absent = new Set([st.players[0].id]);
  const t = generateTournament(ids(st));
  const r = applyTournamentWalkovers(t, absent);
  assert.equal(r.count, 1);
  const res = resolveBracket(r.tournament);
  const m = res.matches.find((x) => x.id === 'R1-M1');
  assert.equal(m.status, 'done');
  assert.equal(m.result.walkover, true);
  assert.equal(m.winner, t.slots[1]); // 1回戦の相手（1シード側の枠の反対）が勝ち上がる
  assert.notEqual(m.winner, st.players[0].id);
  assert.equal(res.matches.find((x) => x.id === 'R2-M1').status, 'waiting'); // 相手はまだ決まらない
  assert.equal(applyTournamentWalkovers(r.tournament, absent).count, 0); // 2回目は何もしない
  assert.deepEqual(r.tournament.walkoverIds, [st.players[0].id]); // 不戦にすると決めた選手を覚える
});

test('不戦にすると決めた選手は、結果が入って次の試合が決まったときも不戦にする（settleWalkovers）', () => {
  const st = sample(4);
  const [a, b, c, d] = ids(st);
  // 1回戦は a-d / b-c。a と d が欠席なら、a が勝ち上がり、b-c の勝者との試合も欠席の a が出る
  let t = applyTournamentWalkovers(generateTournament([a, b, c, d]), new Set([a, d])).tournament;
  assert.equal(resolveBracket(t).matches.find((m) => m.id === 'R1-M2').status, 'ready');
  assert.equal(resolveBracket(t).matches.find((m) => m.id === 'R2-M1').status, 'waiting');
  t = setTournamentResult(t, 'R1-M2', { outcome: 'p1', score1: 2, score2: 1 }).tournament;
  assert.equal(resolveBracket(t).matches.find((m) => m.id === 'R2-M1').status, 'ready');
  const s2 = settleWalkovers(t);
  assert.equal(s2.count, 1); // 決勝（欠席の a に対して b の不戦勝）。3位決定戦は無い
  assert.equal(resolveBracket(s2.tournament).champion, b);
  assert.equal(settleWalkovers(s2.tournament).count, 0);
  // 出席に戻すと、不戦にする選手から外れる
  const back = stopWalkover(t, a);
  assert.deepEqual(back.walkoverIds, [d]);
  assert.equal('walkoverIds' in stopWalkover(back, d), false);
  assert.equal(settleWalkovers(back).tournament.walkoverIds.includes(a), false);
});

test('保存・読込: 不戦にすると決めた選手は残る。表にいない選手・重複・不正な値は捨てる', () => {
  const st = sample(4);
  st.tournament = applyTournamentWalkovers(generateTournament(ids(st)), new Set([st.players[0].id])).tournament;
  const back = parseState(serializeState(st));
  assert.ok(back.ok, back.error);
  assert.deepEqual(back.state.tournament.walkoverIds, [st.players[0].id]);
  const raw = JSON.parse(serializeState(st));
  raw.tournament.walkoverIds = [st.players[0].id, st.players[0].id, 'zzz', 5, null];
  assert.deepEqual(parseState(JSON.stringify(raw)).state.tournament.walkoverIds, [st.players[0].id]);
  raw.tournament.walkoverIds = 'x';
  assert.equal('walkoverIds' in parseState(JSON.stringify(raw)).state.tournament, false);
  const plain = parseState(serializeState({ ...st, tournament: generateTournament(ids(st)) }));
  assert.equal('walkoverIds' in plain.state.tournament, false);
});

test('トーナメントで、欠席者が続けて当たっても、出席者が勝ち上がる（欠席者どうしは上の枠の不戦勝）', () => {
  const st = sample(4);
  const [a, b, c, d] = ids(st);
  // 1回戦は a-d / b-c。a・d・b が欠席なら、a（上の枠）が勝ち上がり、b は c に負け、決勝は c の不戦勝
  const r = applyTournamentWalkovers(generateTournament([a, b, c, d]), new Set([a, b, d]));
  const res = resolveBracket(r.tournament);
  assert.equal(res.matches.filter((m) => m.status === 'done').length, 3);
  assert.equal(res.champion, c);
  assert.equal(res.finished, true);
});

test('トーナメントの3位決定戦も、欠席者が出れば不戦にする', () => {
  const st = sample(4);
  const [a, b, c, d] = ids(st);
  let t = applyTournamentWalkovers(generateTournament([a, b, c, d], { thirdPlace: true }), new Set([a, d])).tournament;
  t = setTournamentResult(t, 'R1-M2', { outcome: 'p1', score1: 1, score2: 0 }).tournament;
  const r = settleWalkovers(t);
  const res = resolveBracket(r.tournament);
  assert.equal(res.matches.find((m) => m.id === '3P').status, 'done'); // d（欠席）の3位決定戦は c の不戦勝
  assert.equal(res.finished, true);
  assert.equal(res.champion, b);
});

test('総当たりで、欠席者が出る未実施の試合を不戦にする。入力済みの試合は変えない', () => {
  const st = sample(4);
  const l = generateLeague(ids(st));
  const done = l.matches[0];
  const withResult = { ...l, results: { [done.id]: { outcome: 'p1', score1: 3, score2: 0, walkover: false } } };
  const absentId = done.p1; // 入力済みの試合に出る選手が欠席
  const r = applyLeagueWalkovers(withResult, new Set([absentId]));
  assert.equal(r.count, 2); // 入力済みの1試合を除く3試合のうち、その選手が出る残りの2試合
  assert.equal(r.league.results[done.id].score1, 3);
  const mine = r.league.matches.filter((m) => m.p1 === absentId || m.p2 === absentId);
  assert.equal(mine.every((m) => r.league.results[m.id]), true);
  for (const m of mine.filter((x) => x.id !== done.id)) {
    const res = r.league.results[m.id];
    assert.equal(res.walkover, true);
    assert.equal(res.outcome, m.p1 === absentId ? 'p2' : 'p1');
  }
  const standings = leagueStandings(r.league);
  const row = standings.find((s) => s.playerId === absentId);
  assert.equal(row.win, 1); // 入力済みの勝ちだけ
  assert.equal(row.loss, 2); // 不戦で負けた2試合
});

test('欠席にしたときの影響: 表を作っていなければ0、作っていれば出る試合の数。勝ち上がる可能性があれば later', () => {
  const st = sample(4);
  const [a, b, c, d] = ids(st);
  const p = a;
  assert.deepEqual(absenceImpact(st, p), { now: 0, later: false });
  st.tournament = generateTournament([a, b, c, d]);
  assert.deepEqual(absenceImpact(st, p), { now: 1, later: false }); // 1回戦の1試合
  st.league = generateLeague(ids(st));
  assert.deepEqual(absenceImpact(st, p), { now: 4, later: false }); // ＋総当たり3試合
  const w = applyWalkovers(st, [p]);
  assert.equal(w.count, 4);
  assert.deepEqual(absenceImpact(w.state, p), { now: 0, later: false });
  assert.equal(w.state.players, st.players); // 名簿は変えない
});

test('欠席にしたときの影響（トーナメント）: 不戦勝で上がった選手は later。負けた選手は何もない', () => {
  const st = sample(5); // 5人: 8枠で、1回戦不戦の選手がいる
  const t = generateTournament(ids(st));
  st.tournament = t;
  const res = resolveBracket(t);
  const byeWinner = res.matches.find((m) => m.status === 'done' && !m.result)?.winner ?? res.rounds[0].find((m) => m.status === 'bye')?.winner;
  assert.ok(byeWinner);
  assert.deepEqual(absenceImpact(st, byeWinner), { now: 0, later: true });
  // 負けた選手
  const first = res.matches.find((m) => m.status === 'ready');
  st.tournament = setTournamentResult(t, first.id, { outcome: 'p1', score1: 1, score2: 0 }).tournament;
  assert.deepEqual(absenceImpact(st, first.p2), { now: 0, later: false });
});

test('次の大会は全員出席から始める。過去の大会には、その日の出欠が残る', () => {
  const st = sample(4);
  st.players = setAbsent(st.players, st.players[0].id, true);
  st.league = generateLeague(ids(st));
  const r = startNextEdition(st);
  assert.equal(r.ok, true);
  assert.equal(attendanceCount(r.state.players).absent, 0);
  assert.equal(r.state.players.length, 4);
  assert.equal(attendanceCount(editionState(r.state, 1).players).absent, 1);
  assert.equal(st.players[0].absent, true); // 元は変わらない
  // 上位N人で次の大会を始めるときも同じ
  const rr = startNextEdition(st, { topCount: 2 });
  assert.equal(rr.ok, true);
  assert.equal(attendanceCount(rr.state.players).absent, 0);
});

test('欠席の選手を含む順位でも、トーナメントの順位は不戦勝の勝者を1位に数える', () => {
  const st = sample(2);
  const t = applyTournamentWalkovers(generateTournament(ids(st)), new Set([st.players[0].id])).tournament;
  const rank = tournamentRanking(t);
  assert.equal(rank[0].playerId, st.players[1].id);
});
