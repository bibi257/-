import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bracketSize, seedOrder, generateTournament, resolveBracket, setTournamentResult,
  tournamentRanking, tournamentProgress, roundName, setTournamentTable, THIRD_PLACE_ID,
} from '../../src/core/bracket.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const tables = (n) => Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `第${i + 1}卓` }));

/** 実際に試合が行われる試合をすべて p1 勝ちで進める */
function playAll(t, pick = () => ({ outcome: 'p1' })) {
  for (;;) {
    const res = resolveBracket(t);
    const m = res.playable.find((x) => x.status === 'ready');
    if (!m) return t;
    const r = setTournamentResult(t, m.id, pick(m));
    assert.ok(r.ok, r.error);
    t = r.tournament;
  }
}

test('枠数は2の累乗', () => {
  assert.equal(bracketSize(2), 2);
  assert.equal(bracketSize(3), 4);
  assert.equal(bracketSize(5), 8);
  assert.equal(bracketSize(16), 16);
  assert.equal(bracketSize(17), 32);
});

test('標準シード順: 1と2は決勝まで当たらない', () => {
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  for (const size of [2, 4, 8, 16, 32, 64, 128]) {
    const o = seedOrder(size);
    assert.deepEqual([...o].sort((a, b) => a - b), Array.from({ length: size }, (_, i) => i + 1));
    // 1回戦の対戦の順位の和は size+1
    for (let i = 0; i < size; i += 2) assert.equal(o[i] + o[i + 1], size + 1);
    // 1位と2位は別の半分
    assert.ok(o.indexOf(1) < size / 2 && o.indexOf(2) >= size / 2);
  }
});

test('2〜128人: 全員が1回ずつ配置され、不戦同士の対戦がない', () => {
  for (let n = 2; n <= 128; n++) {
    const t = generateTournament(ids(n), { seedCount: Math.min(n, 4), placement: 'random' });
    const placed = t.slots.filter(Boolean);
    assert.equal(placed.length, n, `n=${n}`);
    assert.equal(new Set(placed).size, n);
    for (let i = 0; i < t.size; i += 2) assert.ok(t.slots[i] || t.slots[i + 1], `n=${n} 不戦同士`);
    const res = resolveBracket(t);
    assert.equal(res.playable.length, n - 1, `n=${n} 実試合数は n-1`);
    assert.equal(res.stale.length, 0);
  }
});

test('不戦（bye）はシード上位から割り当てられる', () => {
  // 6人 → 8枠、bye 2つ。シード2人ならシード1・2が bye
  const t = generateTournament(ids(6), { seedCount: 2 });
  const res = resolveBracket(t);
  const byeWinners = res.rounds[0].filter((m) => m.status === 'bye').map((m) => m.winner);
  assert.deepEqual(byeWinners.sort(), ['p1', 'p2']);
  // bye 3つ（5人）・シード1人なら、名簿順でp1,p2,p3が bye
  const t5 = generateTournament(ids(5), { seedCount: 1, placement: 'order' });
  const bw = resolveBracket(t5).rounds[0].filter((m) => m.status === 'bye').map((m) => m.winner);
  assert.deepEqual(bw.sort(), ['p1', 'p2', 'p3']);
});

test('シード選手は離れた位置に配置される（抽選でも不変）', () => {
  for (let k = 0; k < 20; k++) {
    const t = generateTournament(ids(16), { seedCount: 4, placement: 'random' });
    const pos = ['p1', 'p2', 'p3', 'p4'].map((p) => t.slots.indexOf(p));
    const quarters = pos.map((i) => Math.floor(i / 4));
    assert.equal(new Set(quarters).size, 4, '4シードは別々の4分の1ブロック');
    assert.ok(pos[0] < 8 && pos[1] >= 8);
  }
});

test('抽選は rng で決まり、名簿順は決定的', () => {
  let x = 0.123;
  const rng = () => (x = (x * 9301 + 0.49297) % 1);
  const a = generateTournament(ids(10), { placement: 'random' }, rng);
  assert.equal(a.slots.filter(Boolean).length, 10);
  const b = generateTournament(ids(10), { placement: 'order' });
  const c = generateTournament(ids(10), { placement: 'order' });
  assert.deepEqual(b.slots, c.slots);
});

test('シード人数が人数を超えても生成できる', () => {
  const t = generateTournament(ids(3), { seedCount: 10 });
  assert.equal(t.seedCount, 3);
  assert.equal(t.slots.filter(Boolean).length, 3);
});

test('1人以下・129人以上はエラー', () => {
  assert.throws(() => generateTournament(ids(1)));
  assert.throws(() => generateTournament(ids(129)));
});

test('勝者が次のラウンドへ反映される', () => {
  let t = generateTournament(ids(4), {});
  // slots: p1,p4,p2,p3
  let r = setTournamentResult(t, 'R1-M1', { score1: 3, score2: 1 });
  assert.ok(r.ok);
  t = r.tournament;
  let res = resolveBracket(t);
  assert.equal(res.rounds[1][0].p1, 'p1');
  assert.equal(res.rounds[1][0].p2, undefined);
  assert.equal(res.rounds[1][0].status, 'waiting');
  t = setTournamentResult(t, 'R1-M2', { score1: 0, score2: 2 }).tournament;
  res = resolveBracket(t);
  assert.equal(res.rounds[1][0].p2, 'p3');
  assert.equal(res.rounds[1][0].status, 'ready');
  t = setTournamentResult(t, 'R2-M1', { outcome: 'p2', walkover: true }).tournament;
  res = resolveBracket(t);
  assert.equal(res.champion, 'p3');
  assert.ok(res.finished);
});

test('不戦（bye）の選手は自動で2回戦へ進む', () => {
  const t = generateTournament(ids(3), {});
  const res = resolveBracket(t);
  assert.equal(res.rounds[0][0].status, 'bye');
  assert.equal(res.rounds[1][0].p1, 'p1');
  // bye の試合には結果を入れられない
  const r = setTournamentResult(t, 'R1-M1', { outcome: 'p1' });
  assert.equal(r.ok, false);
});

test('未定の試合には結果を入れられない', () => {
  const t = generateTournament(ids(4), {});
  const r = setTournamentResult(t, 'R2-M1', { outcome: 'p1' });
  assert.equal(r.ok, false);
  assert.match(r.error, /まだ決まって/);
});

test('引き分け・スコアと勝者の矛盾は拒否', () => {
  const t = generateTournament(ids(2), {});
  assert.equal(setTournamentResult(t, 'R1-M1', { score1: 2, score2: 2 }).ok, false);
  assert.equal(setTournamentResult(t, 'R1-M1', { score1: 2, score2: 1, outcome: 'p2' }).ok, false);
  assert.equal(setTournamentResult(t, 'R1-M1', { outcome: 'draw' }).ok, false);
  // 同点でも勝者を指定すれば可（代表戦など）
  assert.equal(setTournamentResult(t, 'R1-M1', { score1: 2, score2: 2, outcome: 'p2' }).ok, true);
});

test('結果修正: 勝者が変わると後続の結果が消去される', () => {
  let t = generateTournament(ids(4), {});
  t = setTournamentResult(t, 'R1-M1', { outcome: 'p1' }).tournament; // p1 勝ち
  t = setTournamentResult(t, 'R1-M2', { outcome: 'p1' }).tournament; // p2 勝ち
  t = setTournamentResult(t, 'R2-M1', { outcome: 'p2' }).tournament; // p2 優勝
  // 1回戦の勝者を p4 に修正 → 決勝は p4 vs p2 になり、決勝の結果は消える
  const r = setTournamentResult(t, 'R1-M1', { outcome: 'p2' });
  assert.ok(r.ok);
  assert.deepEqual(r.cleared, ['R2-M1']);
  const res = resolveBracket(r.tournament);
  assert.equal(res.rounds[1][0].p1, 'p4');
  assert.equal(res.rounds[1][0].status, 'ready');
  assert.equal(res.champion, undefined);
  assert.equal(res.stale.length, 0);
});

test('結果修正: 勝者が同じでスコアだけ変えた場合は後続を残す', () => {
  let t = generateTournament(ids(4), {});
  t = setTournamentResult(t, 'R1-M1', { score1: 1, score2: 0 }).tournament;
  t = setTournamentResult(t, 'R1-M2', { outcome: 'p1' }).tournament;
  t = setTournamentResult(t, 'R2-M1', { outcome: 'p1' }).tournament;
  const r = setTournamentResult(t, 'R1-M1', { score1: 5, score2: 0 });
  assert.deepEqual(r.cleared, []);
  assert.equal(resolveBracket(r.tournament).champion, 'p1');
});

test('結果の取消で後続が連鎖的に消える', () => {
  let t = generateTournament(ids(8), {});
  t = playAll(t);
  assert.equal(resolveBracket(t).champion, 'p1');
  const r = setTournamentResult(t, 'R1-M1', null);
  assert.deepEqual(r.cleared.sort(), ['R2-M1', 'R3-M1']);
  const res = resolveBracket(r.tournament);
  assert.equal(res.rounds[2][0].status, 'waiting');
});

test('全人数で最後まで進められ、優勝者が1人決まる', () => {
  for (const n of [2, 3, 5, 7, 8, 9, 12, 16, 31, 33, 64, 100, 128]) {
    const t = playAll(generateTournament(ids(n), { seedCount: 2, thirdPlace: true }));
    const res = resolveBracket(t);
    assert.ok(res.finished, `n=${n}`);
    const ranking = tournamentRanking(t, res);
    assert.equal(ranking.filter((x) => x.rank === 1).length, 1);
    assert.equal(ranking.filter((x) => x.rank === null).length, 0, `n=${n} 全員の順位が確定`);
    const prog = tournamentProgress(res);
    assert.equal(prog.done, prog.total);
  }
});

test('3位決定戦: 準決勝の敗者同士が対戦し、3位・4位が決まる', () => {
  let t = generateTournament(ids(4), { thirdPlace: true });
  t = setTournamentResult(t, 'R1-M1', { outcome: 'p1' }).tournament; // p1 vs p4 → p1
  t = setTournamentResult(t, 'R1-M2', { outcome: 'p2' }).tournament; // p2 vs p3 → p3
  let res = resolveBracket(t);
  assert.equal(res.thirdPlace.p1, 'p4');
  assert.equal(res.thirdPlace.p2, 'p2');
  assert.equal(res.thirdPlace.status, 'ready');
  t = setTournamentResult(t, THIRD_PLACE_ID, { outcome: 'p2' }).tournament;
  t = setTournamentResult(t, 'R2-M1', { outcome: 'p1' }).tournament;
  res = resolveBracket(t);
  const rank = Object.fromEntries(tournamentRanking(t, res).map((x) => [x.playerId, x.rank]));
  assert.deepEqual(rank, { p1: 1, p3: 2, p2: 3, p4: 4 });
  // 準決勝の結果を変えると3位決定戦の結果は消える
  const r = setTournamentResult(t, 'R1-M1', { outcome: 'p2' });
  assert.ok(r.cleared.includes(THIRD_PLACE_ID));
  assert.ok(r.cleared.includes('R2-M1'));
});

test('3位決定戦: 2人なら無効、3人なら不戦で3位確定', () => {
  assert.equal(generateTournament(ids(2), { thirdPlace: true }).thirdPlace, false);
  let t = generateTournament(ids(3), { thirdPlace: true });
  t = playAll(t);
  const res = resolveBracket(t);
  assert.equal(res.thirdPlace.status, 'bye');
  const r = tournamentRanking(t, res);
  assert.deepEqual(r.map((x) => x.rank), [1, 2, 3]);
});

test('3位決定戦なしなら準決勝敗者は2人とも3位', () => {
  const t = playAll(generateTournament(ids(8), {}));
  const r = tournamentRanking(t);
  assert.deepEqual(r.map((x) => x.rank), [1, 2, 3, 3, 5, 5, 5, 5]);
  assert.equal(r[4].label, '準々決勝敗退');
});

test('卓の割当: ラウンドごとに順番、時間帯は卓数で区切る', () => {
  const t = generateTournament(ids(8), {});
  const res = resolveBracket(t, tables(3));
  const r1 = res.rounds[0];
  assert.deepEqual(r1.map((m) => m.tableId), ['t1', 't2', 't3', 't1']);
  assert.deepEqual(r1.map((m) => m.timeSlot), [1, 1, 1, 2]);
  assert.deepEqual(res.rounds[1].map((m) => m.tableId), ['t1', 't2']);
  assert.deepEqual(res.playable.map((m) => m.no), [1, 2, 3, 4, 5, 6, 7]);
  // 不戦の試合には卓を割り当てない
  const t6 = resolveBracket(generateTournament(ids(6), {}), tables(2));
  assert.equal(t6.rounds[0].filter((m) => m.tableId).length, 2);
});

test('卓の手動変更と、存在しない卓への変更は無視', () => {
  let t = generateTournament(ids(4), {});
  t = setTournamentTable(t, 'R1-M1', 't2');
  let res = resolveBracket(t, tables(2));
  assert.equal(res.rounds[0][0].tableId, 't2');
  res = resolveBracket(t, tables(1));
  assert.equal(res.rounds[0][0].tableId, 't1');
  t = setTournamentTable(t, 'R1-M1', null);
  assert.deepEqual(t.tableOverrides, {});
});

test('ラウンド名', () => {
  assert.equal(roundName(3, 3), '決勝');
  assert.equal(roundName(2, 3), '準決勝');
  assert.equal(roundName(1, 3), '準々決勝');
  assert.equal(roundName(1, 5), '1回戦');
  assert.equal(roundName(1, 1), '決勝');
});
