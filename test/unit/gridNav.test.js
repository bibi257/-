import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextGridCell, nextListIndex, NAV_KEYS } from '../../src/core/gridNav.js';
import { matrixCellLabel } from '../../src/core/exportData.js';
import { createState, playerLabel } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { generateLeague, setLeagueResult } from '../../src/core/league.js';
import { setAbsent } from '../../src/core/attendance.js';

// 4×4 の対戦表。対角線（自分自身）は止まれない
const grid = (r, c, key) => nextGridCell({ rows: 4, cols: 4, r, c, key, canFocus: (a, b) => a !== b });

test('対戦表の矢印キー: 上下左右へ1マス。自分自身のマスは飛ばす', () => {
  assert.deepEqual(grid(0, 1, 'ArrowRight'), { r: 0, c: 2 });
  assert.deepEqual(grid(0, 2, 'ArrowLeft'), { r: 0, c: 1 });
  assert.deepEqual(grid(0, 1, 'ArrowDown'), { r: 2, c: 1 }); // (1,1) は自分自身なので、その下へ
  assert.deepEqual(grid(2, 1, 'ArrowUp'), { r: 0, c: 1 });
  assert.deepEqual(grid(0, 1, 'ArrowLeft'), { r: 0, c: 1 }); // (0,0) は自分自身。左は無いので動かない
  assert.deepEqual(grid(2, 0, 'ArrowRight'), { r: 2, c: 1 });
  assert.deepEqual(grid(2, 1, 'ArrowRight'), { r: 2, c: 3 }); // (2,2) を飛ばす
});

test('対戦表: 端では動かない。Home／End は行の先頭／最後の止まれるマス', () => {
  assert.deepEqual(grid(0, 3, 'ArrowRight'), { r: 0, c: 3 });
  assert.deepEqual(grid(3, 0, 'ArrowDown'), { r: 3, c: 0 });
  assert.deepEqual(grid(0, 2, 'Home'), { r: 0, c: 1 }); // (0,0) は自分自身
  assert.deepEqual(grid(0, 1, 'End'), { r: 0, c: 3 });
  assert.deepEqual(grid(3, 1, 'End'), { r: 3, c: 2 }); // (3,3) は自分自身
  assert.deepEqual(grid(1, 2, 'Home'), { r: 1, c: 0 });
  assert.deepEqual(grid(1, 2, 'x'), { r: 1, c: 2 }); // 関係ないキーは動かさない
  assert.ok(NAV_KEYS.includes('Home') && NAV_KEYS.includes('ArrowUp'));
});

test('一覧の矢印キー: 上下・Home・End。端では動かない', () => {
  assert.equal(nextListIndex({ count: 5, i: 2, key: 'ArrowDown' }), 3);
  assert.equal(nextListIndex({ count: 5, i: 2, key: 'ArrowUp' }), 1);
  assert.equal(nextListIndex({ count: 5, i: 4, key: 'ArrowDown' }), 4);
  assert.equal(nextListIndex({ count: 5, i: 0, key: 'ArrowUp' }), 0);
  assert.equal(nextListIndex({ count: 5, i: 3, key: 'Home' }), 0);
  assert.equal(nextListIndex({ count: 5, i: 1, key: 'End' }), 4);
  assert.equal(nextListIndex({ count: 0, i: 0, key: 'ArrowDown' }), -1);
  assert.equal(nextListIndex({ count: 3, i: -1, key: 'ArrowDown' }), 1); // どこにもいないときは、先頭の次へ
});

test('対戦表のマスの読み上げ: 未入力・勝ち・負け・引き分け・不戦・欠席', () => {
  const st = createState();
  st.players = makePlayers(['山田 太郎', '佐藤 花子', '鈴木 一郎']);
  st.league = generateLeague(st.players.map((p) => p.id));
  const [a, b] = st.players;
  const m = st.league.matches.find((x) => [x.p1, x.p2].includes(a.id) && [x.p1, x.p2].includes(b.id));
  const label = (l, id, op) => matrixCellLabel({ ...st, league: l }, m, l.results[m.id], id, op);
  assert.equal(label(st.league, a.id, b.id), '山田 太郎 対 佐藤 花子、未入力');
  const win = setLeagueResult(st.league, m.id, { outcome: m.p1 === a.id ? 'p1' : 'p2', score1: m.p1 === a.id ? 3 : 1, score2: m.p1 === a.id ? 1 : 3 }, {});
  assert.equal(win.ok, true);
  assert.equal(label(win.league, a.id, b.id), '山田 太郎 対 佐藤 花子、勝ち 3-1');
  assert.equal(label(win.league, b.id, a.id), '佐藤 花子 対 山田 太郎、負け 1-3');
  const noScore = setLeagueResult(st.league, m.id, { outcome: m.p1 === a.id ? 'p1' : 'p2' }, {});
  assert.equal(label(noScore.league, a.id, b.id), '山田 太郎 対 佐藤 花子、勝ち');
  const wo = setLeagueResult(st.league, m.id, { outcome: m.p1 === a.id ? 'p1' : 'p2', walkover: true }, {});
  assert.equal(label(wo.league, a.id, b.id), '山田 太郎 対 佐藤 花子、不戦勝');
  assert.equal(label(wo.league, b.id, a.id), '佐藤 花子 対 山田 太郎、不戦敗');
  const draw = setLeagueResult(st.league, m.id, { outcome: 'draw', score1: 2, score2: 2 }, { allowDraw: true });
  assert.equal(label(draw.league, a.id, b.id), '山田 太郎 対 佐藤 花子、引き分け 2-2');
  // 欠席の選手には、名前に「（欠席）」が付く
  const abs = { ...st, players: setAbsent(st.players, b.id, true) };
  assert.equal(matrixCellLabel(abs, m, undefined, a.id, b.id), '山田 太郎 対 佐藤 花子（欠席）、未入力');
  assert.equal(playerLabel(abs, b.id), '佐藤 花子（欠席）');
});
