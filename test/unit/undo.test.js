import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUndo, recordChange, popUndo, canUndo, sameContent, MAX_UNDO, MERGE_MS } from '../../src/core/undo.js';

const st = (n, at = '') => ({ meta: { title: 't', updatedAt: at }, players: Array.from({ length: n }, (_, i) => ({ id: `p${i}` })) });

test('履歴: 最初は空で、戻せない', () => {
  const h = createUndo();
  assert.equal(canUndo(h), false);
  assert.equal(popUndo(h), null);
});

test('履歴: 置き換えるたびに前の値を残し、新しいものから順に戻る', () => {
  let h = createUndo();
  const a = st(1), b = st(2), c = st(3);
  h = recordChange(h, a, b);
  h = recordChange(h, b, c);
  assert.equal(canUndo(h), true);
  let r = popUndo(h);
  assert.equal(r.state, b);
  r = popUndo(r.history);
  assert.equal(r.state, a);
  assert.equal(popUndo(r.history), null);
});

test('履歴: 内容が変わらない置き換え（保存時刻だけ違う）は残さない', () => {
  const h = createUndo();
  const a = st(2, '2026-10-19T00:00:00Z');
  const b = st(2, '2026-10-19T00:00:05Z');
  assert.equal(sameContent(a, b), true);
  assert.equal(recordChange(h, a, b), h);
  assert.equal(recordChange(h, a, a), h);
  assert.equal(recordChange(h, null, b), h); // 最初の値（前がない）
  assert.equal(sameContent(st(2), st(3)), false);
});

test('履歴: 大会データが無い・保存時刻の欄が無い値でも、例外にならずに比べる', () => {
  assert.equal(sameContent(null, st(1)), false);
  assert.equal(sameContent(st(1), undefined), false);
  assert.equal(sameContent(null, null), true);
  assert.equal(sameContent({ players: [] }, { players: [] }), true);
  assert.equal(sameContent({ players: [] }, { players: [1] }), false);
  const h = recordChange(createUndo(), st(1), null); // 置き換える先が無くても、前の値は残す
  assert.equal(h.stack.length, 1);
});

test('履歴: 最大20件。多すぎれば古いものから捨てる', () => {
  let h = createUndo();
  for (let i = 0; i < MAX_UNDO + 5; i++) h = recordChange(h, st(i), st(i + 1));
  assert.equal(h.stack.length, MAX_UNDO);
  assert.equal(h.stack[0].players.length, 5); // 0〜4 番目は捨てた
  assert.equal(h.stack[MAX_UNDO - 1].players.length, MAX_UNDO + 4);
});

test('履歴: 入力欄の連続した入力は、1回の操作にまとめる（間が空けば別の操作）', () => {
  let h = createUndo();
  const t0 = 1_000_000;
  h = recordChange(h, st(1), st(2), { merge: true, now: t0 });
  h = recordChange(h, st(2), st(3), { merge: true, now: t0 + 300 });
  h = recordChange(h, st(3), st(4), { merge: true, now: t0 + 900 });
  assert.equal(h.stack.length, 1);
  assert.equal(popUndo(h).state.players.length, 1); // 入力を始める前に戻る
  h = recordChange(h, st(4), st(5), { merge: true, now: t0 + 900 + MERGE_MS + 1 }); // 間が空いた
  assert.equal(h.stack.length, 2);
});

test('履歴: 入力のあとの別の操作は、まとめずに別の履歴にする。戻すと、まとめは解ける', () => {
  let h = createUndo();
  const t0 = 5_000;
  h = recordChange(h, st(1), st(2), { merge: true, now: t0 });
  h = recordChange(h, st(2), st(3), { now: t0 + 100 }); // 入力ではない操作
  assert.equal(h.stack.length, 2);
  h = recordChange(h, st(3), st(4), { merge: true, now: t0 + 200 }); // 入力のまとめは、直前が入力のときだけ
  assert.equal(h.stack.length, 3);
  const r = popUndo(h);
  assert.equal(r.history.mergedAt, 0);
  const next = recordChange(r.history, st(3), st(9), { merge: true, now: t0 + 300 });
  assert.equal(next.stack.length, 3); // 戻した直後の入力は、まとめない
});

test('履歴: 履歴の配列は書き換えない（元の履歴は変わらない）', () => {
  const h = createUndo();
  const h2 = recordChange(h, st(1), st(2));
  assert.equal(h.stack.length, 0);
  const r = popUndo(h2);
  assert.equal(h2.stack.length, 1);
  assert.equal(r.history.stack.length, 0);
});
