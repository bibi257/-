import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialBracketScale, FIT_MIN } from '../../src/core/bracketFit.js';

test('最初の倍率: 枠に入るなら 100%', () => {
  assert.equal(initialBracketScale(1200, 1000), 1);
  assert.equal(initialBracketScale(1000, 1000), 1);
});

test('最初の倍率: 0.75 以上で入らないときは、枠の幅に合わせる（12人・幅1280pxの例）', () => {
  const s = initialBracketScale(1156, 1324);
  assert.ok(Math.abs(s - 1156 / 1324) < 1e-9);
  assert.ok(s >= FIT_MIN && s < 1);
  assert.equal(initialBracketScale(750, 1000), 0.75); // ちょうど 0.75 は合わせる
});

test('最初の倍率: 0.75 未満になる（人数が多い）ときは 100% のまま', () => {
  assert.equal(initialBracketScale(749, 1000), 1);
  assert.equal(initialBracketScale(500, 2400), 1);
});

test('最初の倍率: 枠や表の幅が分からないとき（非表示・0）は 100%', () => {
  assert.equal(initialBracketScale(0, 1324), 1);
  assert.equal(initialBracketScale(1156, 0), 1);
  assert.equal(initialBracketScale(NaN, 1324), 1);
  assert.equal(initialBracketScale(undefined, undefined), 1);
});
