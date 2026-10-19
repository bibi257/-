import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../src/core/state.js';
import { tableSvg, FONT_FAMILY, EXPORT_FONT_FAMILY } from '../../src/render/svg.js';

test('画面用の字体は IBM Plex Sans JP が先頭、PNG 用は端末のフォントだけ', () => {
  assert.match(FONT_FAMILY, /^'IBM Plex Sans JP',/);
  assert.doesNotMatch(EXPORT_FONT_FAMILY, /Plex/);
  assert.ok(FONT_FAMILY.includes(EXPORT_FONT_FAMILY), '画面用は PNG 用のフォントを後ろに含む（読み込めなかったときの代わり）');
});

test('tableSvg は fontFamily の指定でルートの font-family を切り替える', () => {
  const table = { title: '順位表', headers: ['順位', '名前'], rows: [['1', '山田']] };
  const st = createState();
  assert.ok(tableSvg(st, table).svg.includes(`font-family="${FONT_FAMILY}"`));
  const png = tableSvg(st, table, { fontFamily: EXPORT_FONT_FAMILY }).svg;
  assert.ok(png.includes(`font-family="${EXPORT_FONT_FAMILY}"`));
  assert.ok(!png.includes('IBM Plex'));
});
