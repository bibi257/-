import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { generateTournament, setTournamentResult } from '../../src/core/bracket.js';
import { bracketSvg } from '../../src/render/svg.js';
import { THEME, DARK_THEME, cssVarName } from '../../src/render/theme.js';

const css = readFileSync(new URL('../../web/style.css', import.meta.url), 'utf8');

/** `@media <query> { … }` の中身（波括弧の対応で取り出す） */
function mediaBlock(query) {
  const start = css.indexOf(`@media ${query} {`);
  assert.ok(start >= 0, `@media ${query} がない`);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', start) + 1, i);
  }
  throw new Error('波括弧が閉じていない');
}

const DARK_QUERY = 'screen and (prefers-color-scheme: dark)';
const dark = mediaBlock(DARK_QUERY);
const darkRoot = dark.match(/:root\s*\{([\s\S]*?)\n  \}/)[1];
const darkVars = Object.fromEntries([...darkRoot.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map((m) => [m[1], m[2].toLowerCase()]));

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('ダークの値（theme.js の DARK_THEME）は、THEME と同じ色の名前をすべて持つ', () => {
  assert.deepEqual(Object.keys(DARK_THEME).sort(), Object.keys(THEME).sort());
});

test('DARK_THEME の値は、web/style.css のダーク用 :root の変数と一致する', () => {
  for (const [key, value] of Object.entries(DARK_THEME)) {
    const name = cssVarName(key);
    assert.ok(name in darkVars, `ダーク用 :root に ${name} がない`);
    assert.equal(darkVars[name], value.toLowerCase(), `${name} の値が DARK_THEME と違う`);
  }
});

test('ダークの基準色は計画書のとおり（背景・カード・文字・罫線）', () => {
  assert.equal(DARK_THEME.canvas, '#0f1724');
  assert.equal(DARK_THEME.paper, '#172234');
  assert.equal(DARK_THEME.text, '#e6ebf2');
  assert.equal(DARK_THEME.rule, '#2b3a50');
});

test('ダークでの文字と背景のコントラスト比は4.5以上', () => {
  const D = DARK_THEME;
  const pairs = [
    ['text', 'canvas'], ['text', 'paper'], ['ink', 'paper'], ['inkSoft', 'paper'], ['muted', 'paper'], ['muted', 'canvas'],
    ['faint', 'paper'], ['faint', 'canvas'], ['primary', 'paper'], ['primary', 'canvas'], ['primary', 'primaryWeak'], ['text', 'primaryWeak'],
    ['muted', 'primaryWeak'], ['danger', 'paper'], ['danger', 'dangerWeak'], ['ok', 'paper'], ['gold', 'paper'], ['gold', 'goldWeak'],
    ['text', 'goldWeak'], ['onPrimary', 'primary'], ['onPrimary', 'primaryPress'], ['text', 'tableHead'], ['muted', 'tableHead'], ['ink', 'tableHead'],
  ];
  for (const [fg, bg] of pairs) assert.ok(contrast(D[fg], D[bg]) >= 4.5, `${fg}/${bg} = ${contrast(D[fg], D[bg]).toFixed(2)}`);
  assert.ok(contrast('#ffffff', D.chrome) >= 4.5); // ヘッダー・通知の白い文字
});

test('ダークは画面表示（screen）だけ。印刷（print）には効かない。ダークの指定はこの1か所だけ', () => {
  assert.equal([...css.matchAll(/prefers-color-scheme/g)].length, 1);
  assert.ok(css.includes(`@media ${DARK_QUERY} {`));
  // 白背景の指定（印刷）はダークの規則の外にあり、印刷用の見た目は変えていない
  assert.ok(/@media print \{[\s\S]*?:root, body \{ background: #fff;/.test(css));
});

test('トーナメント表の SVG（画面）の fill・stroke は、ダーク用に同じ値の要素を変数へ置き換える規則がそろっている', () => {
  const st = createState();
  st.players = makePlayers(Array.from({ length: 8 }, (_, i) => `選手${i + 1}`));
  let t = generateTournament(st.players.map((p) => p.id), { thirdPlace: true });
  const used = new Set();
  const collect = () => {
    st.tournament = t;
    for (const m of bracketSvg(st, { interactive: true }).svg.matchAll(/\b(fill|stroke)="(#[0-9a-fA-F]{3,6})"/g)) used.add(`${m[1]}|${m[2].toLowerCase()}`);
  };
  collect();
  for (const id of ['R1-M1', 'R1-M2', 'R1-M3', 'R1-M4', 'R2-M1', 'R2-M2', 'R3-M1', '3P']) { t = setTournamentResult(t, id, { score1: 2, score2: 1 }).tournament; collect(); }
  // 同じ値の色（paper と onPrimary は白、ink と chrome は紺）は、THEME で先に書いた色（SVG が使うほう）
  const keyOf = new Map();
  for (const [k, v] of Object.entries(THEME)) if (!keyOf.has(v.toLowerCase())) keyOf.set(v.toLowerCase(), k);
  assert.ok(used.size > 8);
  for (const u of used) {
    const [attr, hex] = u.split('|');
    const key = keyOf.get(hex);
    assert.ok(key, `THEME にない色 ${hex}`);
    assert.ok(dark.includes(`.bracket-wrap svg [${attr}="${hex}"] { ${attr}: var(${cssVarName(key)}); }`), `${attr}="${hex}" をダークで置き換える規則がない`);
  }
});

test('PNG 出力と印刷の SVG（interactive でない）は、今までどおり THEME（白背景）の色だけで、変数もダークの値も含まない', () => {
  const st = createState();
  st.players = makePlayers(['A', 'B', 'C', 'D']);
  st.tournament = generateTournament(st.players.map((p) => p.id), {});
  const svg = bracketSvg(st).svg;
  assert.ok(!svg.includes('var('));
  const lightPaper = svg.includes(`fill="${THEME.paper}"`);
  assert.ok(lightPaper);
  for (const hex of Object.values(DARK_THEME)) {
    if (Object.values(THEME).map((v) => v.toLowerCase()).includes(hex.toLowerCase())) continue; // 明暗で同じ値の色（メダルの色）は除く
    assert.ok(!svg.toLowerCase().includes(hex.toLowerCase()), `PNG 用の SVG にダークの色 ${hex} がある`);
  }
});

test('「自分の試合」の強調の背景（--mine-bg）は、ライトとダークの両方で定義されている', () => {
  assert.match(css.match(/:root\s*\{([\s\S]*?)\n\}/)[1], /--mine-bg:\s*#[0-9a-f]{6}/i);
  assert.match(dark, /--mine-bg:\s*#[0-9a-f]{6}/i);
});
