import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSeeds, effectiveSeedCount, seedOrderNumbers } from '../../src/core/seeds.js';
import { defaultSettings, parseState, serializeState, createState } from '../../src/core/state.js';
import { generateTournament } from '../../src/core/bracket.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `選手${i + 1}` }));
const settings = (patch) => ({ ...defaultSettings(), ...patch });
/** 0.9 ずつ進む決定的な乱数列（テスト用） */
function seqRng(...vals) {
  let i = 0;
  return () => vals[i++ % vals.length];
}

test('既定はシードなし', () => {
  const s = defaultSettings();
  assert.equal(s.seedMode, 'none');
  assert.deepEqual(s.seedIds, []);
  const plan = planSeeds(players(4), s);
  assert.deepEqual(plan.playerIds, ['p1', 'p2', 'p3', 'p4']);
  assert.equal(plan.seedCount, 0);
  assert.equal(effectiveSeedCount(s, players(4)), 0);
});

test('指名: チェックした選手が名簿順にシードになり、残りは名簿順', () => {
  const s = settings({ seedMode: 'pick', seedIds: ['p4', 'p2'] });
  const plan = planSeeds(players(5), s);
  assert.deepEqual(plan.playerIds, ['p2', 'p4', 'p1', 'p3', 'p5']); // シード順位は名簿の上から
  assert.equal(plan.seedCount, 2);
  assert.equal(effectiveSeedCount(s, players(5)), 2);
});

test('指名: 名簿にいない選手の指名は無視する（削除された選手・重複）', () => {
  const s = settings({ seedMode: 'pick', seedIds: ['p9', 'p2', 'p2'] });
  const plan = planSeeds(players(4), s);
  assert.deepEqual(plan.playerIds, ['p2', 'p1', 'p3', 'p4']);
  assert.equal(plan.seedCount, 1);
});

test('ランダム: 指定人数をランダムに選んでシードにする。全員は1回ずつ現れる', () => {
  const s = settings({ seedMode: 'random', seedCount: 2 });
  const plan = planSeeds(players(6), s, seqRng(0, 0.99, 0.5, 0.2, 0.7));
  assert.equal(plan.seedCount, 2);
  assert.equal(new Set(plan.playerIds).size, 6);
  assert.deepEqual([...plan.playerIds].sort(), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
  // 名簿の先頭の2人とは限らない（乱数しだい）が、人数は必ず指定どおり
  const other = planSeeds(players(6), s, seqRng(0.99, 0.99, 0.99, 0.99, 0.99));
  assert.notDeepEqual(plan.playerIds.slice(0, 2), other.playerIds.slice(0, 2));
});

test('ランダム: 人数は0〜参加者数に収める。0人ならシードなし', () => {
  assert.equal(planSeeds(players(4), settings({ seedMode: 'random', seedCount: 9 })).seedCount, 4);
  assert.equal(planSeeds(players(4), settings({ seedMode: 'random', seedCount: 0 })).seedCount, 0);
  assert.equal(effectiveSeedCount(settings({ seedMode: 'random', seedCount: 3 }), players(2)), 2);
});

test('元の名簿・設定を書き換えない', () => {
  const ps = players(4);
  const s = settings({ seedMode: 'pick', seedIds: ['p3'] });
  planSeeds(ps, s);
  assert.deepEqual(ps.map((p) => p.id), ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(s.seedIds, ['p3']);
});

test('トーナメント生成: 指名したシードが別の半分に分かれ、不戦はシード上位から', () => {
  const s = settings({ seedMode: 'pick', seedIds: ['p3', 'p6'] });
  const plan = planSeeds(players(6), s);
  const t = generateTournament(plan.playerIds, { ...s, seedCount: plan.seedCount });
  const half = t.slots.length / 2;
  const idx = (id) => t.slots.indexOf(id);
  assert.ok(idx('p3') < half && idx('p6') >= half || idx('p3') >= half && idx('p6') < half);
  // 8枠・6人 → 不戦2枠。シード（p3, p6）が不戦（slot が null の相手）を受ける
  const byeNeighbor = (id) => t.slots[idx(id) % 2 === 0 ? idx(id) + 1 : idx(id) - 1];
  assert.equal(byeNeighbor('p3'), null);
  assert.equal(byeNeighbor('p6'), null);
});

test('シード順位の番号（指名）: 名簿の上から 1, 2…', () => {
  const s = settings({ seedMode: 'pick', seedIds: ['p3', 'p1'] });
  const m = seedOrderNumbers(players(4), s);
  assert.equal(m.get('p1'), 1);
  assert.equal(m.get('p3'), 2);
  assert.equal(m.has('p2'), false);
  assert.equal(seedOrderNumbers(players(4), settings({ seedMode: 'random', seedCount: 2 })).size, 0);
});

test('保存・読込: シードの設定が往復する。名簿にいない指名は読み込み時に捨てる', () => {
  const st = createState();
  st.players = players(4);
  st.settings = settings({ seedMode: 'pick', seedIds: ['p2', 'p3'] });
  const r = parseState(serializeState(st));
  assert.equal(r.ok, true);
  assert.equal(r.state.settings.seedMode, 'pick');
  assert.deepEqual(r.state.settings.seedIds, ['p2', 'p3']);
  const raw = JSON.parse(serializeState(st));
  raw.settings.seedIds = ['p2', 'zzz', 'p2', 'p4'];
  assert.deepEqual(parseState(raw).state.settings.seedIds, ['p2', 'p4']);
  raw.settings.seedMode = 'bogus';
  assert.equal(parseState(raw).state.settings.seedMode, 'none');
});

test('古い形式（seedCount だけ）: シード人数が1以上なら、名簿の上から指名した扱いで読む', () => {
  const st = createState();
  st.players = players(5);
  const raw = JSON.parse(serializeState(st));
  raw.settings = { seedCount: 2, placement: 'order', thirdPlace: false };
  const s = parseState(raw).state.settings;
  assert.equal(s.seedMode, 'pick');
  assert.deepEqual(s.seedIds, ['p1', 'p2']);
  raw.settings = { seedCount: 0 };
  assert.equal(parseState(raw).state.settings.seedMode, 'none');
});

test('古い形式: 過去の回の設定も同じように移行する', () => {
  const st = createState();
  st.players = players(4);
  st.tournament = generateTournament(['p1', 'p2', 'p3', 'p4']);
  const raw = JSON.parse(serializeState(st));
  raw.history = [{ edition: 1, date: '', archivedAt: '', players: raw.players, tables: raw.tables,
    settings: { seedCount: 1 }, tournament: raw.tournament, league: null }];
  const h = parseState(raw).state.history[0].settings;
  assert.equal(h.seedMode, 'pick');
  assert.deepEqual(h.seedIds, ['p1']);
});
