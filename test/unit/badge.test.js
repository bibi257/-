import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { statusBadge, BADGE_STATUSES } from '../../src/ui/badge.js';

test('状態バッジ: 4種類を、状態ごとのクラスと文字で出す', () => {
  assert.deepEqual(BADGE_STATUSES, ['ready', 'done', 'waiting', 'bye']);
  assert.equal(statusBadge('ready'), '<span class="badge badge-ready">試合待ち</span>');
  assert.equal(statusBadge('done'), '<span class="badge badge-done">終了</span>');
  assert.equal(statusBadge('waiting'), '<span class="badge badge-waiting">対戦者未定</span>');
  assert.equal(statusBadge('bye'), '<span class="badge badge-bye">不戦</span>');
});

test('状態バッジ: 表に出さない状態・不明な値では何も出さない', () => {
  assert.equal(statusBadge('empty'), '');
  assert.equal(statusBadge(undefined), '');
  assert.equal(statusBadge('<img src=x>'), '');
});

test('状態バッジのCSS: 試合待ち＝青の塗り、終了＝灰の枠、対戦者未定＝点線、不戦＝枠なし', () => {
  const css = readFileSync(new URL('../../web/style.css', import.meta.url), 'utf8');
  const rule = (name) => css.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`))[1];
  assert.match(rule('badge'), /font-size:\s*12px/);
  // 文字は primary の面の上の文字（ライトでは白、ダークでは濃い色）
  assert.match(rule('badge-ready'), /background:\s*var\(--primary\)[^;]*;[^}]*color:\s*var\(--on-primary\)/);
  assert.match(rule('badge-done'), /border-color:\s*var\(--rule-strong\)/);
  assert.match(rule('badge-waiting'), /dashed/);
  assert.doesNotMatch(rule('badge-bye'), /border-color|dashed|background/);
});
