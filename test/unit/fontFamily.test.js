import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { generateTournament } from '../../src/core/bracket.js';
import { tableSvg, bracketSvg, FONT_FAMILY } from '../../src/render/svg.js';
import * as svgModule from '../../src/render/svg.js';

test('字体は IBM Plex Sans JP が先頭で、後ろに端末のフォントを持つ（読み込めなかったときの代わり）', () => {
  assert.match(FONT_FAMILY, /^'IBM Plex Sans JP',/);
  assert.match(FONT_FAMILY, /sans-serif$/);
});

test('画面と PNG 出力は同じフォント（PNG 専用のフォント指定はない。N14 案B）', () => {
  assert.equal(svgModule.EXPORT_FONT_FAMILY, undefined);
  const table = { title: '順位表', headers: ['順位', '名前'], rows: [['1', '山田']] };
  const st = createState();
  assert.ok(tableSvg(st, table).svg.includes(`font-family="${FONT_FAMILY}"`));
  st.players = makePlayers(['A', 'B', 'C']);
  st.tournament = generateTournament(st.players.map((p) => p.id), {});
  assert.ok(bracketSvg(st).svg.includes(`font-family="${FONT_FAMILY}"`));
});
