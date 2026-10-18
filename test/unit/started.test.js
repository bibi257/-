import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, parseState, serializeState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import {
  generateTournament, resolveBracket, setTournamentResult, setTournamentStarted, THIRD_PLACE_ID,
} from '../../src/core/bracket.js';
import { generateLeague, resolveLeague, setLeagueResult, setLeagueStarted } from '../../src/core/league.js';
import { isStartTime, elapsedMinutes } from '../../src/core/started.js';
import { tableBoard, busyOnSameTable } from '../../src/core/tableBoard.js';
import { callBoard } from '../../src/core/callBoard.js';
import { startNextEdition, editionState } from '../../src/core/edition.js';

const T0 = '2026-10-18T05:00:00.000Z';
const T1 = '2026-10-18T05:12:30.000Z';
const mins = (n) => Date.parse(T0) + n * 60000;

function sample(n = 8, opts = {}) {
  const st = createState();
  st.players = makePlayers(Array.from({ length: n }, (_, i) => `選手${i + 1}`));
  st.tables = [{ id: 't1', name: '第1卓' }, { id: 't2', name: '第2卓' }];
  const ids = st.players.map((p) => p.id);
  st.tournament = generateTournament(ids, opts);
  st.league = generateLeague(ids);
  return st;
}
const match = (t, id) => resolveBracket(t).matches.find((m) => m.id === id);

test('開始時刻の検査と、経過時間（分・切り捨て・負にならない）', () => {
  assert.equal(isStartTime(T0), true);
  assert.equal(isStartTime('2026-10-18T05:00:00Z'), true);
  for (const bad of ['', 'x', '2026-10-18', '2026-13-45T25:61:00.000Z', 1, null, undefined, '2026-10-18T05:00:00+09:00']) assert.equal(isStartTime(bad), false, String(bad));
  assert.equal(elapsedMinutes(T0, mins(0)), 0);
  assert.equal(elapsedMinutes(T0, mins(12) + 59000), 12);
  assert.equal(elapsedMinutes(T0, mins(-5)), 0); // 端末の時計のずれ
  assert.equal(elapsedMinutes('bad', mins(3)), 0);
});

test('トーナメント: 対戦者が決まっていて結果がない試合を開始できる。取り消すと元に戻る', () => {
  let t = generateTournament(['a', 'b', 'c', 'd'], {});
  assert.equal(match(t, 'R1-M1').startedAt, null);
  const r = setTournamentStarted(t, 'R1-M1', T0);
  assert.ok(r.ok);
  t = r.tournament;
  assert.equal(match(t, 'R1-M1').startedAt, T0);
  assert.equal(match(t, 'R1-M1').status, 'ready'); // 状態は試合待ちのまま（「進行中」は開始時刻の有無で決める）
  assert.equal(match(t, 'R1-M2').startedAt, null);
  t = setTournamentStarted(t, 'R1-M1', null).tournament;
  assert.equal(match(t, 'R1-M1').startedAt, null);
  assert.deepEqual(t.started, {});
});

test('トーナメント: 対戦者が未定・結果が入力済み・不戦・存在しない試合は開始できない。時刻が不正でも', () => {
  const t = generateTournament(['a', 'b', 'c', 'd'], {});
  assert.match(setTournamentStarted(t, 'R2-M1', T0).error, /対戦者がまだ決まっていません/);
  assert.match(setTournamentStarted(t, 'R1-M1', 'bad').error, /開始時刻/);
  assert.match(setTournamentStarted(t, 'R9-M9', T0).error, /見つかりません/);
  const done = setTournamentResult(t, 'R1-M1', { outcome: 'p1' }).tournament;
  assert.match(setTournamentStarted(done, 'R1-M1', T0).error, /入力済み/);
  const bye = generateTournament(['a', 'b', 'c'], {}); // 3人: 1回戦に不戦がある
  const byeMatch = resolveBracket(bye).matches.find((m) => m.status === 'bye');
  assert.match(setTournamentStarted(bye, byeMatch.id, T0).error, /見つかりません/);
});

test('トーナメント: すでに開始している試合を開始し直しても、最初の開始時刻のまま', () => {
  let t = generateTournament(['a', 'b'], {});
  t = setTournamentStarted(t, 'R1-M1', T0).tournament;
  t = setTournamentStarted(t, 'R1-M1', T1).tournament;
  assert.equal(match(t, 'R1-M1').startedAt, T0);
});

test('トーナメント: 結果が入ると開始（進行中）は終わる。結果を取り消しても、進行中には戻らない', () => {
  let t = generateTournament(['a', 'b', 'c', 'd'], {});
  t = setTournamentStarted(t, 'R1-M1', T0).tournament;
  t = setTournamentResult(t, 'R1-M1', { outcome: 'p1' }).tournament;
  assert.equal(match(t, 'R1-M1').startedAt, null);
  assert.deepEqual(t.started, {});
  t = setTournamentResult(t, 'R1-M1', null).tournament;
  assert.equal(match(t, 'R1-M1').startedAt, null);
});

test('トーナメント: 前の試合の結果を直して対戦者が変わったら、決勝の開始は無効になる', () => {
  let t = generateTournament(['a', 'b', 'c', 'd'], {});
  t = setTournamentResult(t, 'R1-M1', { outcome: 'p1' }).tournament;
  t = setTournamentResult(t, 'R1-M2', { outcome: 'p1' }).tournament;
  t = setTournamentStarted(t, 'R2-M1', T0).tournament;
  assert.equal(match(t, 'R2-M1').startedAt, T0);
  t = setTournamentResult(t, 'R1-M1', { outcome: 'p2' }).tournament; // 勝者が変わる → 決勝の対戦者が変わる
  assert.equal(match(t, 'R2-M1').status, 'ready');
  assert.equal(match(t, 'R2-M1').startedAt, null);
  assert.deepEqual(t.started, {});
});

test('トーナメント: 3位決定戦も開始できる', () => {
  let t = generateTournament(['a', 'b', 'c', 'd'], { thirdPlace: true });
  t = setTournamentResult(t, 'R1-M1', { outcome: 'p1' }).tournament;
  t = setTournamentResult(t, 'R1-M2', { outcome: 'p1' }).tournament;
  t = setTournamentStarted(t, THIRD_PLACE_ID, T0).tournament;
  assert.equal(match(t, THIRD_PLACE_ID).startedAt, T0);
});

test('総当たり: 開始・取り消し・結果で終わる。結果入力済みは開始できない', () => {
  let l = generateLeague(['a', 'b', 'c', 'd']);
  const id = l.matches[0].id;
  const at = (l2) => resolveLeague(l2).matches.find((m) => m.id === id).startedAt;
  l = setLeagueStarted(l, id, T0).league;
  assert.equal(at(l), T0);
  assert.equal(setLeagueStarted(l, id, T1).league.started[id].at, T0); // 開始し直しても変わらない
  l = setLeagueStarted(l, id, null).league;
  assert.equal(at(l), null);
  l = setLeagueStarted(l, id, T0).league;
  l = setLeagueResult(l, id, { score1: 2, score2: 1, outcome: 'p1', walkover: false }, { allowDraw: true }).league;
  assert.equal(at(l), null);
  assert.deepEqual(l.started, {});
  assert.match(setLeagueStarted(l, id, T0).error, /入力済み/);
  assert.match(setLeagueStarted(l, 'L999', T0).error, /見つかりません/);
  assert.match(setLeagueStarted(generateLeague(['a', 'b']), 'L1', 'bad').error, /開始時刻/);
});

test('保存データ: 古い形式（started なし）は、開始なしとして読み込める。保存して読み込むと残る', () => {
  const st = sample(4);
  delete st.tournament.started;
  delete st.league.started;
  const old = parseState(serializeState(st));
  assert.ok(old.ok, old.error);
  assert.deepEqual(old.state.tournament.started, {});
  assert.deepEqual(old.state.league.started, {});

  const st2 = sample(4);
  st2.tournament = setTournamentStarted(st2.tournament, 'R1-M1', T0).tournament;
  st2.league = setLeagueStarted(st2.league, st2.league.matches[0].id, T1).league;
  const back = parseState(serializeState(st2));
  assert.ok(back.ok, back.error);
  assert.equal(back.state.tournament.started['R1-M1'].at, T0);
  assert.equal(back.state.league.started[st2.league.matches[0].id].at, T1);
});

test('保存データ: 形式の違う開始（時刻が不正・対戦者がない・試合がない）は捨てる。読み込みは失敗しない', () => {
  const st = sample(4);
  const id = st.league.matches[0].id;
  st.tournament.started = {
    'R1-M1': { at: T0, p1: st.tournament.slots[0], p2: st.tournament.slots[3] },
    'R1-M2': { at: 'いつか', p1: 'x', p2: 'y' },
    'R2-M1': { at: T0 }, // 対戦者がない
    '<bad>': { at: T0, p1: 'x', p2: 'y' },
    'R1-M3': 'text',
  };
  st.league.started = { [id]: { at: T0 }, L999: { at: T0 }, [st.league.matches[1].id]: { at: 5 } };
  const r = parseState(serializeState(st));
  assert.ok(r.ok, r.error);
  assert.deepEqual(Object.keys(r.state.tournament.started), ['R1-M1']);
  assert.deepEqual(Object.keys(r.state.league.started), [id]);
});

test('卓の状況: 進行中の卓と、空いている卓（その卓の次の試合を「次」に出す）', () => {
  const st = sample(8);
  let board = tableBoard(st, 'tournament', mins(0));
  assert.equal(board.length, 2);
  assert.ok(board.every((b) => b.state === 'free' && b.running === null));
  assert.equal(board[0].next.no, 1); // 第1卓の次は No.1
  assert.equal(board[1].next.no, 2);
  st.tournament = setTournamentStarted(st.tournament, 'R1-M1', T0).tournament;
  board = tableBoard(st, 'tournament', mins(12) + 30000);
  assert.equal(board[0].state, 'busy');
  assert.equal(board[0].running.no, 1);
  assert.equal(board[0].running.minutes, 12);
  assert.equal(board[0].running.label, '準々決勝');
  assert.equal(board[0].running.p1, '選手1');
  assert.equal(board[0].next, null);
  assert.equal(board[1].state, 'free');
  assert.equal(board[1].next.no, 2);
  // 表がない・種類が違うときは空
  assert.deepEqual(tableBoard({ ...st, tournament: null }, 'tournament'), []);
  assert.deepEqual(tableBoard(createState(), 'league'), []);
});

test('卓の状況（総当たり）: 今の回戦の試合だけが対象', () => {
  const st = sample(4);
  const first = resolveLeague(st.league, st.tables).matches[0];
  st.league = setLeagueStarted(st.league, first.id, T0).league;
  const board = tableBoard(st, 'league', mins(3));
  const busy = board.find((b) => b.state === 'busy');
  assert.equal(busy.running.no, 1);
  assert.equal(busy.running.label, '1回戦');
  assert.equal(busy.running.minutes, 3);
});

test('卓が割り当てられていない試合どうしは、同じ卓とは見なさない', () => {
  const st = sample(4);
  st.tables = [];
  const ready = resolveBracket(st.tournament, st.tables).playable.filter((m) => m.status === 'ready');
  assert.equal(ready.length, 2);
  assert.ok(ready.every((m) => !m.tableId));
  st.tournament = setTournamentStarted(st.tournament, ready[0].id, T0).tournament;
  assert.equal(busyOnSameTable(st, 'tournament', ready[1].id, mins(5)), null);
});

test('同じ卓で別の試合が進行中のとき、開始の前に分かる', () => {
  const st = sample(8);
  const res = resolveBracket(st.tournament, st.tables);
  const sameTable = res.playable.filter((m) => m.tableId === 't1' && m.status === 'ready');
  assert.ok(sameTable.length >= 2);
  st.tournament = setTournamentStarted(st.tournament, sameTable[0].id, T0).tournament;
  const busy = busyOnSameTable(st, 'tournament', sameTable[1].id, mins(5));
  assert.equal(busy.no, sameTable[0].no);
  assert.equal(busy.minutes, 5);
  assert.equal(busyOnSameTable(st, 'tournament', sameTable[0].id, mins(5)), null); // 自分自身は数えない
  const other = res.playable.find((m) => m.tableId === 't2' && m.status === 'ready');
  assert.equal(busyOnSameTable(st, 'tournament', other.id, mins(5)), null);
});

test('呼び出し画面の内容: 進行中の試合には開始時刻が付く', () => {
  const st = sample(4);
  st.tournament = setTournamentStarted(st.tournament, 'R1-M1', T0).tournament;
  const b = callBoard(st, 'tournament');
  assert.equal(b.items.find((x) => x.id === 'R1-M1').startedAt, T0);
  assert.equal(b.items.find((x) => x.id === 'R1-M2').startedAt, null);
});

test('過去の回の表示には、進行中を出さない', () => {
  let st = sample(4);
  st.tournament = setTournamentStarted(st.tournament, 'R1-M1', T0).tournament;
  const r = startNextEdition(st);
  assert.ok(r.ok, r.error);
  const view = editionState(r.state, 1);
  assert.deepEqual(view.tournament.started, {});
  assert.equal(resolveBracket(view.tournament).matches.find((m) => m.id === 'R1-M1').startedAt, null);
  assert.equal(r.state.tournament, null); // 次の回は表が空
});
