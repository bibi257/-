import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateLeague, resolveLeague, setLeagueResult, leagueStandings, leagueProgress, setLeagueTable,
} from '../../src/core/league.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const tables = (n) => Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `第${i + 1}卓` }));
const pairKey = (m) => [m.p1, m.p2].sort().join('-');

test('2〜40人: 全組み合わせがちょうど1回、各回戦で1人1試合まで', () => {
  for (let n = 2; n <= 40; n++) {
    const l = generateLeague(ids(n));
    assert.equal(l.matches.length, (n * (n - 1)) / 2, `n=${n}`);
    assert.equal(new Set(l.matches.map(pairKey)).size, l.matches.length);
    const res = resolveLeague(l);
    assert.equal(res.roundCount, n % 2 ? n : n - 1);
    for (let r = 1; r <= res.roundCount; r++) {
      const players = l.matches.filter((m) => m.round === r).flatMap((m) => [m.p1, m.p2]);
      assert.equal(new Set(players).size, players.length, `n=${n} r=${r}`);
      // 奇数なら各回戦1人休み
      assert.equal(res.rest[r - 1].length, n % 2);
    }
  }
});

test('人数の範囲外はエラー', () => {
  assert.throws(() => generateLeague(ids(1)));
  assert.throws(() => generateLeague(ids(41)));
});

test('卓と時間帯の割当', () => {
  const l = generateLeague(ids(6)); // 1回戦3試合
  const res = resolveLeague(l, tables(2));
  const r1 = res.matches.filter((m) => m.round === 1);
  assert.deepEqual(r1.map((m) => m.tableId), ['t1', 't2', 't1']);
  assert.deepEqual(r1.map((m) => m.timeSlot), [1, 1, 2]);
  const l2 = setLeagueTable(l, r1[2].id, 't2');
  assert.equal(resolveLeague(l2, tables(2)).matches[2].tableId, 't2');
});

test('結果入力と引き分けの可否', () => {
  const l = generateLeague(ids(2));
  const id = l.matches[0].id;
  let r = setLeagueResult(l, id, { score1: 1, score2: 1 }, { allowDraw: true });
  assert.ok(r.ok);
  assert.equal(r.league.results[id].outcome, 'draw');
  r = setLeagueResult(l, id, { score1: 1, score2: 1 }, { allowDraw: false });
  assert.equal(r.ok, false);
  r = setLeagueResult(l, id, { score1: '', score2: '3' }, { allowDraw: true });
  assert.equal(r.ok, false);
  r = setLeagueResult(l, id, { score1: '-1', score2: '3' }, { allowDraw: true });
  assert.equal(r.ok, false);
  r = setLeagueResult(l, id, { score1: '２', score2: '1' }, { allowDraw: true });
  assert.ok(r.ok, '全角数字も受け付ける');
  assert.equal(r.league.results[id].score1, 2);
  r = setLeagueResult(r.league, id, null);
  assert.deepEqual(r.league.results, {});
});

function league3(results) {
  // p1,p2,p3 の総当たりに結果を入れる。results: {'p1-p2': [s1, s2] | 'wo:p1'}
  let l = generateLeague(ids(3));
  for (const m of l.matches) {
    const key = `${m.p1}-${m.p2}`;
    const rev = `${m.p2}-${m.p1}`;
    let v = results[key];
    let input;
    if (v === undefined && results[rev] !== undefined) {
      v = results[rev];
      input = typeof v === 'string' ? { walkover: true, outcome: v.slice(3) === m.p1 ? 'p1' : 'p2' } : { score1: v[1], score2: v[0] };
    } else if (v !== undefined) {
      input = typeof v === 'string' ? { walkover: true, outcome: v.slice(3) === m.p1 ? 'p1' : 'p2' } : { score1: v[0], score2: v[1] };
    } else continue;
    l = setLeagueResult(l, m.id, input).league;
  }
  return l;
}

test('順位: 勝点順', () => {
  const l = league3({ 'p1-p2': [1, 0], 'p1-p3': [2, 0], 'p2-p3': [1, 1] });
  const s = leagueStandings(l);
  assert.deepEqual(s.map((r) => r.points), [6, 1, 1]);
  assert.equal(s[0].win, 2);
  assert.equal(s[0].gf, 3);
  assert.equal(s[0].ga, 0);
  // p2: 0-1, 1-1 → 得失点差 -1。p3: 0-2, 1-1 → -2。直接対決は引分なので得失点差で p2 が上
  assert.deepEqual(s.map((r) => r.playerId), ['p1', 'p2', 'p3']);
  assert.deepEqual(s.map((r) => r.rank), [1, 2, 3]);
});

test('順位: 直接対決も並ぶ（三すくみ）なら得失点差', () => {
  // p1: p2に負け(0-1)、p3に大勝(5-0) → 勝点3 差+4
  // p2: p1に勝ち(1-0)、p3に負け(0-1) → 勝点3 差0
  // p3: p1に負け、p2に勝ち → 勝点3 差-4
  // 3人とも勝点3、直接対決の勝点も全員3 → 得失点差で p1,p2,p3
  let l = league3({ 'p1-p2': [0, 1], 'p1-p3': [5, 0], 'p2-p3': [0, 1] });
  assert.deepEqual(leagueStandings(l).map((r) => r.playerId), ['p1', 'p2', 'p3']);
  // 4人: 3人が勝点で並び、直接対決も三すくみの場合
  const ids4 = ['p1', 'p2', 'p3', 'p4'];
  l = generateLeague(ids4);
  const score = { 'p1-p2': [0, 1], 'p1-p3': [9, 0], 'p1-p4': [9, 0], 'p2-p3': [1, 0], 'p2-p4': [0, 1], 'p3-p4': [0, 1] };
  for (const m of l.matches) {
    const k = `${m.p1}-${m.p2}`;
    const v = score[k] ?? [...score[`${m.p2}-${m.p1}`]].reverse();
    l = setLeagueResult(l, m.id, { score1: v[0], score2: v[1] }).league;
  }
  const s = leagueStandings(l);
  // p1: 6点(差+17), p2: 6点(差+1), p4: 6点(差-7)
  // 3人が6点。直接対決の勝点は全員3（三すくみ）→ 得失点差で決まる
  assert.deepEqual(s.map((r) => r.playerId), ['p1', 'p2', 'p4', 'p3']);
});

test('順位: 2人が並び直接対決で決まる', () => {
  const ids4 = ['a', 'b', 'c', 'd'];
  let l = generateLeague(ids4);
  // a: b勝, c負, d勝 → 6 / b: a負, c勝, d勝 → 6 / c: a勝, b負, d負 → 3 / d: 0+...
  const win = { 'a-b': 'a', 'a-c': 'c', 'a-d': 'a', 'b-c': 'b', 'b-d': 'b', 'c-d': 'd' };
  for (const m of l.matches) {
    const w = win[`${m.p1}-${m.p2}`] ?? win[`${m.p2}-${m.p1}`];
    // b の得失点を大きくしても、直接対決で a が上
    const big = w === 'b' ? 9 : 1;
    l = setLeagueResult(l, m.id, w === m.p1 ? { score1: big, score2: 0 } : { score1: 0, score2: big }).league;
  }
  const s = leagueStandings(l);
  assert.equal(s[0].playerId, 'a');
  assert.equal(s[1].playerId, 'b');
});

test('順位: 完全に同じなら同順位', () => {
  const l = generateLeague(ids(2));
  const s = leagueStandings(setLeagueResult(l, l.matches[0].id, { score1: 1, score2: 1 }).league);
  assert.deepEqual(s.map((r) => r.rank), [1, 1]);
  // 未試合の状態でも全員同順位
  assert.deepEqual(leagueStandings(generateLeague(ids(3))).map((r) => r.rank), [1, 1, 1]);
});

test('不戦勝は勝ちとして数え、得失点には含めない', () => {
  const l = league3({ 'p1-p2': 'wo:p1' });
  const s = leagueStandings(l);
  const p1 = s.find((r) => r.playerId === 'p1');
  const p2 = s.find((r) => r.playerId === 'p2');
  assert.equal(p1.win, 1);
  assert.equal(p1.points, 3);
  assert.equal(p1.gf, 0);
  assert.equal(p2.loss, 1);
});

test('勝点の設定を変えられる', () => {
  const l = league3({ 'p1-p2': [1, 0], 'p2-p3': [1, 1] });
  const s = leagueStandings(l, { win: 2, draw: 1, loss: 0 });
  assert.equal(s.find((r) => r.playerId === 'p1').points, 2);
});

test('進行状況: 次に行う回戦', () => {
  let l = generateLeague(ids(4));
  let p = leagueProgress(resolveLeague(l));
  assert.equal(p.nextRound, 1);
  assert.equal(p.ready.length, 2);
  for (const m of l.matches.filter((x) => x.round === 1)) l = setLeagueResult(l, m.id, { outcome: 'p1' }).league;
  p = leagueProgress(resolveLeague(l));
  assert.equal(p.nextRound, 2);
  assert.equal(p.done, 2);
  assert.equal(p.total, 6);
});
