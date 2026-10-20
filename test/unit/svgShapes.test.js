import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { generateTournament, resolveBracket } from '../../src/core/bracket.js';
import { bracketSvg, tableSvg, FONT_FAMILY } from '../../src/render/svg.js';
import { parseExportSvg } from '../../src/render/svgShapes.js';

function stateWith(n, names) {
  const st = createState();
  st.players = makePlayers(names ?? Array.from({ length: n }, (_, i) => `選手${i + 1}`));
  st.tournament = generateTournament(st.players.map((p) => p.id), {});
  return st;
}
const count = (svg, tag) => (svg.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length;

test('トーナメント表の SVG は、rect・line・text に読み取れる（数が SVG と一致。背景の rect だけ除く）', () => {
  const st = stateWith(12);
  const { svg, width, height } = bracketSvg(st);
  const parsed = parseExportSvg(svg);
  assert.equal(parsed.width, width);
  assert.equal(parsed.height, height);
  assert.equal(parsed.fontFamily, FONT_FAMILY);
  const of = (type) => parsed.shapes.filter((s) => s.type === type).length;
  assert.equal(of('rect'), count(svg, 'rect') - 1);
  assert.equal(of('line'), count(svg, 'line'));
  assert.equal(of('text'), count(svg, 'text'));
  assert.ok(parsed.shapes.length > 30);
});

test('描く順は SVG のとおりで、文字は「&」などを元に戻す', () => {
  const st = stateWith(2, ['A&B <1>', '"二"']);
  const texts = parseExportSvg(bracketSvg(st).svg).shapes.filter((s) => s.type === 'text').map((s) => s.text);
  assert.ok(texts.includes('A&B <1>'));
  assert.ok(texts.includes('"二"'));
});

test('表（順位表など）の SVG も読み取れて、太字・中央寄せ・色が取れる', () => {
  const table = { title: '順位表', headers: ['順位', '名前'], rows: [['1', '山田'], ['2', '鈴木']], note: '注記' };
  const { svg } = tableSvg(createState(), table);
  const parsed = parseExportSvg(svg);
  const title = parsed.shapes.find((s) => s.type === 'text' && s.text === '順位表');
  assert.equal(title.bold, true);
  assert.equal(title.size, 20);
  const head = parsed.shapes.find((s) => s.type === 'text' && s.text === '名前');
  assert.equal(head.anchor, 'middle');
  assert.match(head.fill, /^#[0-9a-f]{6}$/i);
  assert.ok(parsed.shapes.some((s) => s.type === 'rect' && s.fill));
});

test('rect の角丸・枠・線の太さが取れる', () => {
  const rect = parseExportSvg(bracketSvg(stateWith(4)).svg).shapes.find((s) => s.type === 'rect' && s.rx);
  assert.equal(rect.rx, 4);
  assert.ok(rect.stroke);
  assert.ok(rect.strokeWidth >= 1);
});

test('PNG 用の SVG に使う要素の種類は rect・line・text だけ（増えたら、読み取りの処理も直す）', () => {
  const st = stateWith(9);
  const res = resolveBracket(st.tournament);
  assert.ok(res.rounds.length > 0);
  const svgs = [bracketSvg(st).svg, tableSvg(st, { title: 't', headers: ['a'], rows: [['b'], ['c']], note: 'n' }).svg];
  for (const svg of svgs) {
    const tags = new Set([...svg.matchAll(/<([a-zA-Z]+)/g)].map((m) => m[1]));
    assert.deepEqual([...tags].sort(), ['line', 'rect', 'svg', 'text'].filter((t) => tags.has(t)));
    for (const t of tags) assert.ok(['svg', 'rect', 'line', 'text'].includes(t), `未対応の要素: ${t}`);
  }
});

test('未対応の要素や属性を見つけたら、静かに無視せずエラーにする', () => {
  const wrap = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10" font-family="x">${body}</svg>`;
  assert.throws(() => parseExportSvg(wrap('<path d="M0 0L1 1"/>')), /未対応の要素.*path/);
  assert.throws(() => parseExportSvg(wrap('<g><rect x="0" y="0" width="1" height="1"/></g>')), /未対応の要素.*g/);
  assert.throws(() => parseExportSvg(wrap('<rect x="0" y="0" width="1" height="1" opacity="0.5"/>')), /未対応の属性.*opacity/);
  assert.throws(() => parseExportSvg(wrap('<rect x="0" y="0" width="1" height="1" transform="rotate(5)"/>')), /未対応の属性.*transform/);
  assert.throws(() => parseExportSvg(wrap('<line x1="0" y1="0" x2="1" y2="1" stroke="#000" stroke-dasharray="2"/>')), /未対応の属性/);
  assert.throws(() => parseExportSvg(wrap('<text x="0" y="0" dominant-baseline="hanging">a</text>')), /dominant-baseline/);
  assert.throws(() => parseExportSvg(wrap('<text x="0" y="0">a<tspan>b</tspan></text>')), /未対応の要素.*tspan/);
  assert.throws(() => parseExportSvg(wrap('<rect x="a" y="0" width="1" height="1"/>')), /数値/);
  assert.throws(() => parseExportSvg('<rect x="0"/>'), /<svg>/);
});
