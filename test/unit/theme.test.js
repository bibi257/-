import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { generateTournament, setTournamentResult } from '../../src/core/bracket.js';
import { generateLeague } from '../../src/core/league.js';
import { leagueMatrixTable } from '../../src/core/exportData.js';
import { bracketSvg, tableSvg } from '../../src/render/svg.js';
import { THEME, cssVarName } from '../../src/render/theme.js';

const css = readFileSync(new URL('../../web/style.css', import.meta.url), 'utf8');
const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1];
const rootVars = Object.fromEntries([...rootBlock.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map((m) => [m[1], m[2].toLowerCase()]));

function sample() {
  const st = createState();
  st.players = makePlayers(['A', 'B', 'C', 'D']);
  st.tournament = generateTournament(st.players.map((p) => p.id), {});
  st.tournament = setTournamentResult(st.tournament, 'R1-M1', { score1: 3, score2: 0 }).tournament;
  st.league = generateLeague(st.players.map((p) => p.id));
  return st;
}

test('theme.js の色は web/style.css の :root の変数と一致する', () => {
  for (const [key, value] of Object.entries(THEME)) {
    const name = cssVarName(key);
    assert.ok(name in rootVars, `:root に ${name} がない`);
    assert.equal(rootVars[name], value.toLowerCase(), `${name} の値が theme.js と違う`);
  }
});

test('色の名前の変換（camelCase → --kebab-case）', () => {
  assert.equal(cssVarName('primaryWeak'), '--primary-weak');
  assert.equal(cssVarName('ink'), '--ink');
  assert.equal(cssVarName('goldLine'), '--gold-line');
});

test('PNG・画面の SVG（トーナメント表・表）は theme.js の色だけを使う', () => {
  const st = sample();
  const allowed = new Set(Object.values(THEME).map((v) => v.toLowerCase()));
  const outputs = [bracketSvg(st).svg, bracketSvg(st, { interactive: true }).svg, tableSvg(st, leagueMatrixTable(st)).svg];
  for (const svg of outputs) {
    const used = new Set([...svg.matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((m) => m[0].toLowerCase()));
    for (const c of used) assert.ok(allowed.has(c), `theme.js にない色 ${c} を使っている`);
  }
});

test('トーナメント表の勝ち上がり線・勝者の枠は青（primary）。赤（danger）は表に出ない', () => {
  const st = sample();
  const svg = bracketSvg(st).svg;
  assert.ok(svg.includes(`stroke="${THEME.primary}"`)); // 勝ち上がり線・勝者の枠
  assert.ok(svg.includes(`fill="${THEME.primaryWeak}"`)); // 勝者の枠の塗り
  assert.ok(!svg.includes(THEME.danger) && !svg.includes(THEME.dangerWeak));
  assert.ok(!tableSvg(st, leagueMatrixTable(st)).svg.includes(THEME.danger)); // 総当たり表にも赤は出ない
  assert.ok(!('win' in THEME)); // 勝者用の赤は持たない
});

test('結果入力で選んだ行は赤ではなく青（primary）で示す', () => {
  const rules = [...css.matchAll(/^\s*(\.rd-player:has\(input:checked\)|\.rd-row:has\(input\[name="outcome"\]:checked\))\s*\{([^}]*)\}/gm)];
  assert.ok(rules.length >= 2);
  for (const [, , body] of rules) {
    assert.ok(body.includes('var(--primary)') && body.includes('var(--primary-weak)'), body);
    assert.ok(!/danger|--win/.test(body), body);
  }
  assert.ok(/\.rd-badge\s*\{[^}]*var\(--primary\)/.test(css));
});

test('画面の CSS で赤（danger）は削除・エラーにだけ使う', () => {
  const allowedSelectors = /(button\.danger|input\.invalid|\.error|\.errors|\.toast\.error|share-chip\.bad|\.bad)\b/;
  const outside = [...css.slice(css.indexOf('}', css.indexOf(':root'))).matchAll(/([^{}]+)\{([^}]*var\(--danger(?:-weak)?\)[^}]*)\}/g)];
  assert.ok(outside.length > 0);
  for (const [, selector] of outside) {
    assert.ok(allowedSelectors.test(selector), `削除・エラー以外で danger を使っている: ${selector.trim()}`);
  }
});

test('呼び出し画面（#call-screen・.cs-*）は、色を直書きせず :root の変数を使う', () => {
  const rules = [...css.matchAll(/^((?:#call-screen|\.cs-)[^{]*)\{([^}]*)\}/gm)];
  assert.ok(rules.length > 10);
  for (const [, selector, body] of rules) {
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(body), `${selector.trim()} に色の直書きがある: ${body.trim().slice(0, 80)}`);
  }
});
