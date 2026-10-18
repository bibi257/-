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
};

/** THEME のキー → web/style.css の :root の変数名 */
export function cssVarName(key) {
  return '--' + key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}
