import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickNextMatch } from '../../src/core/result.js';

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
