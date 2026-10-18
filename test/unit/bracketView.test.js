import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { generateTournament } from '../../src/core/bracket.js';
import { bracketSvg } from '../../src/render/svg.js';
import { stepZoom, ZOOM_STEPS, controlsHtml } from '../../src/ui/bracketView.js';

test('拡大率: 50%〜150%、25%刻み。限度を超えない', () => {
  assert.deepEqual(ZOOM_STEPS, [50, 75, 100, 125, 150]);
  assert.equal(stepZoom(100, 'in'), 125);
  assert.equal(stepZoom(125, 'in'), 150);
  assert.equal(stepZoom(150, 'in'), 150);
  assert.equal(stepZoom(100, 'out'), 75);
  assert.equal(stepZoom(75, 'out'), 50);
  assert.equal(stepZoom(50, 'out'), 50);
});

test('拡大率: 全体表示で中途半端な値（例 72%）のときは、次の段に進む', () => {
  assert.equal(stepZoom(72, 'in'), 75);
  assert.equal(stepZoom(72, 'out'), 50);
  assert.equal(stepZoom(30, 'in'), 50);
  assert.equal(stepZoom(30, 'out'), 50);
});

test('操作バー: 全体表示・縮小・拡大と、回戦ごとの移動ボタン', () => {
  const html = controlsHtml(['1回戦', '準決勝', '決勝', '優勝']);
  assert.match(html, /data-zoom="fit"[^>]*>全体表示</);
  assert.match(html, /data-zoom="out" aria-label="縮小"/);
  assert.match(html, /data-zoom="in" aria-label="拡大"/);
  assert.deepEqual([...html.matchAll(/data-col="(\d+)">([^<]+)</g)].map((m) => [m[1], m[2]]), [['0', '1回戦'], ['1', '準決勝'], ['2', '決勝'], ['3', '優勝']]);
  assert.ok(html.includes('no-print')); // 印刷には出さない
});

test('トーナメント表の SVG: 各列（回戦・優勝）の左端の x を返す', () => {
  for (const n of [4, 12, 32]) {
    const st = createState();
    st.players = makePlayers(Array.from({ length: n }, (_, i) => `選手${i + 1}`));
    st.tournament = generateTournament(st.players.map((p) => p.id), {});
    const { columns, width } = bracketSvg(st);
    const R = Math.ceil(Math.log2(n));
    assert.equal(columns.length, R + 1, `n=${n}`);
    assert.ok(columns.every((x, i) => i === 0 || x > columns[i - 1]));
    assert.ok(columns.at(-1) < width);
  }
});
