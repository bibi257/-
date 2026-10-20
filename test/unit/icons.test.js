import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url));
const pngSize = (buf, at = 0) => {
  assert.equal(buf.subarray(at, at + 8).toString('hex'), '89504e470d0a1a0a', 'PNG の署名');
  return [buf.readUInt32BE(at + 16), buf.readUInt32BE(at + 20)];
};

test('アイコン: 元の図柄（scripts/icon.svg）と、ブラウザのタブ用の favicon.svg が同じ', () => {
  const src = read('scripts/icon.svg').toString('utf8');
  assert.equal(read('web/favicon.svg').toString('utf8'), src);
  assert.match(src, /viewBox="0 0 64 64"/);
  assert.match(src, /fill="#13233a"/); // 背景は --ink
  assert.match(src, /rx="14"/); // 角丸の正方形
  assert.doesNotMatch(src, /<text/); // 文字は入れない
});

test('アイコン: ホーム画面用の apple-touch-icon.png は 180×180 の PNG', () => {
  assert.deepEqual(pngSize(read('web/apple-touch-icon.png')), [180, 180]);
});

test('アイコン: .exe 用の icon.ico は、256×256 を含む PNG 入りの .ico', () => {
  const ico = read('build/icon.ico');
  assert.equal(ico.readUInt16LE(0), 0); // 予約
  assert.equal(ico.readUInt16LE(2), 1); // 種類: アイコン
  const n = ico.readUInt16LE(4);
  assert.ok(n >= 4);
  const sizes = [];
  for (let i = 0; i < n; i++) {
    const o = 6 + i * 16;
    const w = ico[o] || 256; // 256px は 0 で表す
    const len = ico.readUInt32LE(o + 8);
    const off = ico.readUInt32LE(o + 12);
    assert.ok(off + len <= ico.length);
    assert.deepEqual(pngSize(ico, off), [w, w]); // 中身の PNG の大きさが、見出しと同じ
    sizes.push(w);
  }
  assert.ok(sizes.includes(256) && sizes.includes(16) && sizes.includes(32));
});

test('アイコン: index.html が作ったファイルを指し（data: の小さな図ではない）、electron-builder の設定が .ico を指す', () => {
  const html = read('web/index.html').toString('utf8');
  assert.match(html, /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml">/);
  assert.match(html, /<link rel="apple-touch-icon" href="apple-touch-icon\.png">/);
  assert.doesNotMatch(html, /rel="icon" href="data:/);
  const pkg = JSON.parse(read('package.json').toString('utf8'));
  assert.equal(pkg.build.win.icon, 'build/icon.ico');
  assert.ok(existsSync(new URL('../../build/icon.ico', import.meta.url)));
  assert.equal(pkg.scripts.icons, 'node scripts/make-icons.mjs');
  assert.ok(!('sharp' in { ...pkg.dependencies, ...pkg.devDependencies })); // 画像変換にネイティブの部品を足さない
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), []); // 実行時の依存は0個のまま
});
