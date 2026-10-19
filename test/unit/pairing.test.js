import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTournament, resolveBracket, swapSlots } from '../../src/core/bracket.js';
import { parseState, createState, serializeState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

test('配置の指定: slots を渡すと、1回戦の配置がその指定どおりになる', () => {
  const base = generateTournament(ids(8));
  const slots = swapSlots(base.slots, 0, 5);
  const t = generateTournament(ids(8), { slots });
  assert.deepEqual(t.slots, slots);
  assert.notDeepEqual(t.slots, base.slots);
  assert.equal(t.size, 8);
  assert.deepEqual(t.playerIds, ids(8));
  assert.deepEqual(t.results, {});
});

test('入れ替え: 2人の位置が入れ替わり、ほかは変わらない。元の配置は変えない', () => {
  const base = generateTournament(ids(8)).slots;
  const copy = [...base];
  const out = swapSlots(base, 1, 6);
  assert.equal(out[1], base[6]);
  assert.equal(out[6], base[1]);
  assert.deepEqual(out.filter((_, i) => i !== 1 && i !== 6), base.filter((_, i) => i !== 1 && i !== 6));
  assert.deepEqual(base, copy);
});

test('入れ替え: 不戦の位置・同じ位置・範囲外は例外（不戦どうしの試合ができるのを防ぐ）', () => {
  const t = generateTournament(ids(5)); // 8枠・不戦3
  const bye = t.slots.indexOf(null);
  assert.throws(() => swapSlots(t.slots, bye, 0));
  assert.throws(() => swapSlots(t.slots, 0, 0));
  assert.throws(() => swapSlots(t.slots, 0, 99));
  assert.throws(() => swapSlots(t.slots, 0, 1.5));
});

test('入れ替えたあとも、不戦の位置は変わらず、不戦どうしの試合はできない（5〜31人のすべて）', () => {
  for (let n = 3; n <= 31; n++) {
    const base = generateTournament(ids(n));
    const players = base.slots.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    let slots = base.slots;
    for (let k = 0; k < 6; k++) {
      const x = players[k % players.length];
      const y = players[(k * 5 + 3) % players.length];
      if (x !== y) slots = swapSlots(slots, x, y);
    }
    const t = generateTournament(ids(n), { slots });
    assert.deepEqual(t.slots.map((s) => s === null), base.slots.map((s) => s === null), `${n}人`);
    const res = resolveBracket(t);
    assert.ok(res.rounds[0].every((m) => !(m.p1 === null && m.p2 === null)));
    assert.equal(res.playable.length, n - 1);
  }
});

test('配置の指定が正しくなければ、例外にする（人数・重複・知らない選手・不戦どうし）', () => {
  const base = generateTournament(ids(8)).slots;
  assert.throws(() => generateTournament(ids(8), { slots: base.slice(1) }));
  assert.throws(() => generateTournament(ids(8), { slots: [...base.slice(0, 7), base[0]] })); // 重複
  assert.throws(() => generateTournament(ids(8), { slots: [...base.slice(0, 7), 'zzz'] })); // 知らない選手
  const five = generateTournament(ids(5)).slots;
  const i = five.indexOf(null);
  const j = five.findIndex((s, k) => s !== null && k !== (i ^ 1) && k >> 1 !== i >> 1);
  const bad = [...five];
  // 不戦の隣の選手を、別の組の選手と入れ替えずに不戦にすると、不戦どうしの組ができる
  bad[i ^ 1] = null;
  bad[j] = five[i ^ 1];
  assert.throws(() => generateTournament(ids(5), { slots: bad }));
});

test('入れ替えた表は、保存・読込できる（シードの位置の規則は検査しない）', () => {
  const st = createState();
  st.players = makePlayers(['a', 'b', 'c', 'd', 'e', 'f']);
  const pids = st.players.map((p) => p.id);
  const base = generateTournament(pids, { seedCount: 2 });
  const players = base.slots.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  st.tournament = generateTournament(pids, { seedCount: 2, slots: swapSlots(base.slots, players[0], players[5]) });
  const back = parseState(serializeState(st));
  assert.ok(back.ok, back.error);
  assert.deepEqual(back.state.tournament.slots, st.tournament.slots);
});
