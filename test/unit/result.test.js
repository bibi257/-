import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickNextMatch, normalizeResultInput } from '../../src/core/result.js';

const ms = (...nos) => nos.map((no) => ({ id: `m${no}`, no }));

test('pickNextMatch: 今の試合より後ろの番号のうち、最も早いものを選ぶ', () => {
  assert.equal(pickNextMatch(ms(2, 3, 4), 1).id, 'm2');
  assert.equal(pickNextMatch(ms(4, 2, 3), 2).id, 'm3');
});

test('pickNextMatch: 後ろに無ければ先頭に戻る', () => {
  assert.equal(pickNextMatch(ms(1, 2), 5).id, 'm1');
  assert.equal(pickNextMatch(ms(3, 1), 3).id, 'm1');
});

test('pickNextMatch: 自分自身は選ばない。候補が無ければ null', () => {
  assert.equal(pickNextMatch(ms(3), 3), null);
  assert.equal(pickNextMatch([], 1), null);
  assert.equal(pickNextMatch(ms(3), 1).id, 'm3');
});

test('pickNextMatch: 元の配列を並べ替えない', () => {
  const a = ms(4, 2, 3);
  pickNextMatch(a, 1);
  assert.deepEqual(a.map((m) => m.no), [4, 2, 3]);
});

test('結果の入力: 勝敗は p1・p2・draw のどれか。それ以外（スコアなしでも）は弾く', () => {
  for (const outcome of ['zzz', 'P1', { x: 1 }, ['p1'], 'p1 ']) {
    assert.equal(normalizeResultInput({ outcome, score1: null, score2: null }, { allowDraw: true }).ok, false, String(outcome));
    assert.equal(normalizeResultInput({ outcome, score1: 3, score2: 1 }, { allowDraw: true }).ok, false, String(outcome));
    assert.equal(normalizeResultInput({ outcome, walkover: true }, { allowDraw: true }).ok, false, String(outcome));
  }
  assert.deepEqual(normalizeResultInput({ outcome: 'p2' }, { allowDraw: false }).value, { outcome: 'p2', score1: null, score2: null, walkover: false });
});
