// 色の定義（1か所）。web/style.css の :root の変数と同じ値にする（test/unit/theme.test.js が一致を確かめる）。
// 画面・PNG 出力・印刷は、ここか :root の変数のどちらかだけを使う。
//
// 赤（danger）は削除・エラーだけに使う。
// 勝者（トーナメント表の勝ち上がり線・勝者の枠、結果入力で選んだ行）・操作の強調は青（primary）、優勝・シードは金（gold）を使う。

export const THEME = {
  ink: '#13233a',
  inkSoft: '#2c3e57',
  canvas: '#eef1f5',
  paper: '#ffffff',
  rule: '#d8dee6',
  ruleStrong: '#b4bfcc',
  text: '#1c2530',
  muted: '#5a6677',
  faint: '#8791a0',
  primary: '#1d5fbf',
  primaryPress: '#164c99',
  primaryWeak: '#e8f0fb',
  danger: '#b8322a',
  dangerWeak: '#fdf1f0',
  ok: '#2c7a3f',
  gold: '#8a5a00',
  goldWeak: '#fff6dc',
  goldLine: '#e9c46a',
  tableHead: '#f3f6fa',
  medalGold: '#e0a800',
  medalSilver: '#9aa5b1',
  medalBronze: '#b87333',
  chrome: '#13233a', // ヘッダー・通知など、濃い面（文字は白）
  onPrimary: '#ffffff', // primary の面の上の文字
};

/**
 * 画面表示だけのダークモード用の値（端末がダークモードのとき、web/style.css の
 * `@media screen and (prefers-color-scheme: dark)` の :root が同じ値で上書きする）。
 * PNG 出力と印刷は白背景のまま変えないので、THEME（上）だけを使い、ここは使わない。
 */
export const DARK_THEME = {
  ink: '#f0f4f9',
  inkSoft: '#c6d0de',
  canvas: '#0f1724',
  paper: '#172234',
  rule: '#2b3a50',
  ruleStrong: '#40536f',
  text: '#e6ebf2',
  muted: '#a9b5c6',
  faint: '#8d9ab0',
  primary: '#6aa6f5',
  primaryPress: '#8dbaf7',
  primaryWeak: '#1c3558',
  danger: '#ff9a92',
  dangerWeak: '#3b2024',
  ok: '#63c77e',
  gold: '#f0c75e',
  goldWeak: '#3a2f12',
  goldLine: '#9c7a2a',
  tableHead: '#1c2a40',
  medalGold: '#e0a800',
  medalSilver: '#9aa5b1',
  medalBronze: '#b87333',
  chrome: '#0a101b',
  onPrimary: '#0b1424',
};

/** THEME のキー → web/style.css の :root の変数名 */
export function cssVarName(key) {
  return '--' + key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}
