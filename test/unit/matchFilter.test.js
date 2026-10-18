import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultFilter, sanitizeFilter, isFiltered, filterRows, countText } from '../../src/core/matchFilter.js';
import { leagueResultRows } from '../../src/core/exportData.js';
import { createState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { generateLeague, setLeagueResult } from '../../src/core/league.js';

/** 山田・佐藤・鈴木・高橋の4人（6試合・3回戦）。1試合目だけ終了済み */
function fixture() {
  const base = createState();
  const players = makePlayers(['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎']);
  let league = generateLeague(players.map((p) => p.id));
  const first = league.matches[0];
  league = setLeagueResult(league, first.id, { score1: '3', score2: '1', outcome: 'p1', walkover: false }, { allowDraw: true }).league;
  return { ...base, players, league, tables: [{ id: 't1', name: '第1卓' }, { id: 't2', name: '第2卓' }] };
}
const rowsOf = (st) => leagueResultRows(st);

test('初期値は何も絞り込まない。全試合が残る', () => {
  const rows = rowsOf(fixture());
  assert.equal(rows.length, 6);
  assert.equal(isFiltered(defaultFilter()), false);
  assert.equal(filterRows(rows, defaultFilter()).length, 6);
});

test('状態: 未入力は終了以外、終了は結果が入った試合だけ', () => {
  const rows = rowsOf(fixture());
  assert.equal(filterRows(rows, { ...defaultFilter(), status: 'done' }).length, 1);
  assert.equal(filterRows(rows, { ...defaultFilter(), status: 'pending' }).length, 5);
});

test('回戦: 選んだ回戦の試合だけ（4人なら各回戦2試合）', () => {
  const rows = rowsOf(fixture());
  const r2 = filterRows(rows, { ...defaultFilter(), round: '2' });
  assert.equal(r2.length, 2);
  assert.ok(r2.every((r) => r.match.round === 2));
});

test('卓: 選んだ卓の試合だけ。卓が決まっていない試合は、どの卓を選んでも出ない', () => {
  const rows = [
    { match: { status: 'ready', round: 1, tableId: 't1' }, cells: [1, '1回戦', '第1卓', 1, 'A', '', 'B', '', ''] },
    { match: { status: 'ready', round: 1, tableId: 't2' }, cells: [2, '1回戦', '第2卓', 1, 'C', '', 'D', '', ''] },
    { match: { status: 'ready', round: 1, tableId: null }, cells: [3, '1回戦', '', '', 'E', '', 'F', '', ''] },
  ];
  assert.deepEqual(filterRows(rows, { ...defaultFilter(), table: 't2' }).map((r) => r.cells[0]), [2]);
});

test('選手名: 部分一致で、選手1・選手2のどちらでもよい。空白・全角半角・大文字小文字は無視する', () => {
  const rows = rowsOf(fixture());
  const hit = (name) => filterRows(rows, { ...defaultFilter(), name }).length;
  assert.equal(hit('山田'), 3); // 山田は3試合に出る
  assert.equal(hit('山田太郎'), 3); // 空白なしでも
  assert.equal(hit(' 次郎 '), 3);
  assert.equal(hit('一郎'), 3);
  assert.equal(hit('該当なし'), 0);
  const roman = [{ match: { status: 'ready', round: 1, tableId: null }, cells: [1, '1回戦', '', '', 'Ken Ａｂｅ', '', 'Bob', '', ''] }];
  assert.equal(filterRows(roman, { ...defaultFilter(), name: 'ken abe' }).length, 1);
  assert.equal(filterRows(roman, { ...defaultFilter(), name: 'BOB' }).length, 1);
});

test('条件はすべて満たす行だけ残る（AND）', () => {
  const rows = rowsOf(fixture());
  const f = { ...defaultFilter(), status: 'pending', name: '山田' };
  assert.equal(filterRows(rows, f).length, 2); // 山田の3試合のうち、終了済みの1試合を除く
  assert.equal(isFiltered(f), true);
  assert.equal(isFiltered({ ...defaultFilter(), name: '   ' }), false); // 空白だけは条件にならない
});

test('保存されていた値を直す: 不正な値・なくなった回戦や卓は「すべて」に戻る', () => {
  const choices = { rounds: [1, 2, 3], tableIds: ['t1', 't2'] };
  assert.deepEqual(sanitizeFilter(null, choices), defaultFilter());
  assert.deepEqual(sanitizeFilter('x', choices), defaultFilter());
  assert.deepEqual(sanitizeFilter({ status: 'done', round: '2', table: 't1', name: '山田' }, choices), { status: 'done', round: '2', table: 't1', name: '山田' });
  assert.deepEqual(sanitizeFilter({ status: 'bad', round: '9', table: 'zz', name: 5 }, choices), defaultFilter());
  assert.equal(sanitizeFilter({ name: 'あ'.repeat(100) }, choices).name.length, 40);
});

test('件数の文言', () => {
  assert.equal(countText(12, 66), '66試合中 12試合を表示');
  assert.equal(countText(0, 6), '6試合中 0試合を表示');
});
