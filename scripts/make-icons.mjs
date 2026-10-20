// アイコンの画像ファイルを、元の図柄（scripts/icon.svg）から作る。手動で実行して、できたファイルをコミットする（`npm run icons`）。
//   web/favicon.svg          ブラウザのタブ用（元の図柄のまま）
//   web/apple-touch-icon.png スマホのホーム画面用（180×180。角丸なし。iOS が自分で角を丸める）
//   build/icon.ico           Windows の .exe 用（16〜256px の PNG を入れた .ico。electron-builder の設定で指定）
// ビルド（npm run build）では作らない。画像への変換にブラウザ（Playwright の Chromium）を使うので、ネイティブの部品を使うライブラリは足さない。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'scripts', 'icon.svg'), 'utf8');
const square = source.replace(' rx="14"', ''); // 角丸なし（ホーム画面用）

const browser = await chromium.launch();
async function png(svg, size) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  return buf;
}

/** PNG を入れた .ico（Windows Vista 以降は PNG の中身に対応。256px は、幅・高さの欄を 0 にする） */
function ico(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2); // 種類: アイコン
  head.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = head.length + dir.length;
  images.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size === 256 ? 0 : size, o);
    dir.writeUInt8(size === 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4); // 色の面
    dir.writeUInt16LE(32, o + 6); // ビット数
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([head, dir, ...images.map((x) => x.data)]);
}

mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'web', 'favicon.svg'), source);
writeFileSync(join(root, 'web', 'apple-touch-icon.png'), await png(square, 180));
const sizes = [16, 24, 32, 48, 64, 128, 256];
writeFileSync(join(root, 'build', 'icon.ico'), ico(await Promise.all(sizes.map(async (size) => ({ size, data: await png(source, size) })))));
await browser.close();
console.log('アイコンを作りました: web/favicon.svg, web/apple-touch-icon.png, build/icon.ico');
