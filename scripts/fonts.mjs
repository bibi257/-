// フォント（IBM Plex Sans JP・IBM Plex Mono。SIL OFL）を node_modules から web/fonts/ にそろえ、fonts.css を作る。
// file:// と Electron でも動くよう、Google Fonts は使わず同梱する。生成物はコミットしない（.gitignore）。
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'web', 'fonts');

// [パッケージ, CSS ファイル]。本文は 400 と 700（CSS は normal / bold だけ使う）。日本語は漢字を unicode-range で分割した配信
const SOURCES = [
  ['ibm-plex-sans-jp', '400.css'], ['ibm-plex-sans-jp', 'japanese-400.css'],
  ['ibm-plex-sans-jp', '700.css'], ['ibm-plex-sans-jp', 'japanese-700.css'],
  ['ibm-plex-mono', 'latin-400.css'], ['ibm-plex-mono', 'latin-700.css'],
];

export function buildFonts() {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  let css = '/* 生成物（scripts/fonts.mjs）。IBM Plex Sans JP / IBM Plex Mono — SIL Open Font License 1.1 */\n';
  for (const [pkg, file] of SOURCES) {
    const dir = join(root, 'node_modules', '@fontsource', pkg);
    if (!existsSync(join(dir, file))) throw new Error(`フォントが見つかりません: ${pkg}/${file}（npm ci を実行してください）`);
    for (const block of readFileSync(join(dir, file), 'utf8').split('/* ').slice(1)) {
      if (/-cyrillic-/.test(block)) continue; // 使わない文字種は同梱しない
      const woff2 = [...block.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)].map((m) => m[1]);
      for (const f of woff2) cpSync(join(dir, 'files', f), join(out, f));
      // woff（旧形式）は使わない。woff2 だけにする
      css += `/* ${block.replace(/,\s*url\(\.\/files\/[^)]+\.woff\) format\('woff'\)/, '').replace(/url\(\.\/files\//g, 'url(./')}`;
    }
  }
  for (const pkg of ['ibm-plex-sans-jp', 'ibm-plex-mono']) {
    cpSync(join(root, 'node_modules', '@fontsource', pkg, 'LICENSE'), join(out, `LICENSE-${pkg}.txt`));
  }
  writeFileSync(join(out, 'fonts.css'), css);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) buildFonts();
