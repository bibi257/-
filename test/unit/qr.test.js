import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeQr, rsRemainder, QR_MAX_BYTES } from '../../src/core/qr.js';
import { qrSvg } from '../../src/render/qr.js';

const LINK = 'https://tournament.tdu-app.workers.dev/#v=abcd2345';
// 次の期待値は、独立した QR 読み取り（jsQR）で、LINK がそのまま読めることを確かめた出力
const EXPECTED = [
  '#######.....###.##.###.#..#######',
  '#.....#..#.#######......#.#.....#',
  '#.###.#.#....#..###.####..#.###.#',
  '#.###.#.#..#..#.#...#.###.#.###.#',
  '#.###.#.####...#..#..#.#..#.###.#',
  '#.....#.###.##.##...##..#.#.....#',
  '#######.#.#.#.#.#.#.#.#.#.#######',
  '........###.#..#.....####........',
  '#.#####..###.###.##...#.#.#####..',
  '##...#......#...#.####.#..##.####',
  '###...#.##.....##.#..##.###.#.##.',
  '#......#....#.#.#...##.####.###.#',
  '#.###.###......#..#.....#..###...',
  '#..##...#..#.#####..#.##..##..###',
  '..#####..##.#.#....#.##..#####.#.',
  '.##......####...#..####.###...#..',
  '.###..######....##.##.#..#.##...#',
  '.#..##.##..##...######.#.###.####',
  '.#.#.##.###.##.#.#.........##.##.',
  '....#...#.#.#...######...#######.',
  '.####.#..###.##.#..#....##..##.#.',
  '##..##.#.##.####..#..###.##..#..#',
  '#.###.#.##..#####.#.###..#.....#.',
  '#.##....####...#....###......##.#',
  '#...#####.#....#.#....#######....',
  '........#.#..##....#.#.##...#.#.#',
  '#######.....####..#....##.#.#.##.',
  '#.....#.#..#.#.#....#####...#####',
  '#.###.#.##.##..#..#.#...######..#',
  '#.###.#.#.#.#.###..#..##.#..#####',
  '#.###.#.#.##.#....#...##..##..#..',
  '#.....#..##..#..#.#.##.#.#..###..',
  '#######.###.###.##..#.#.#.##...#.',
];

const rowsOf = (qr) => qr.modules.map((r) => r.map((c) => (c ? '#' : '.')).join(''));
const bytes = (n) => 'a'.repeat(n);

test('リード・ソロモン符号: 既知の例（HELLO WORLD・バージョン1-M）の誤り訂正語と一致する', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual([...rsRemainder(data, 10)], [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('QR: 文字数に応じてバージョンが決まる（境目: 14/15・26/27・213/214バイト）', () => {
  assert.equal(QR_MAX_BYTES, 213);
  const v = (n) => encodeQr(bytes(n)).version;
  assert.equal(v(1), 1);
  assert.equal(v(14), 1);
  assert.equal(v(15), 2);
  assert.equal(v(26), 2);
  assert.equal(v(27), 3);
  assert.equal(v(122), 7);
  assert.equal(v(123), 8);
  assert.equal(v(213), 10);
  assert.throws(() => encodeQr(bytes(214)), /長すぎ/);
  assert.throws(() => encodeQr(''), /空/);
  // 日本語は UTF-8 で3バイト（71文字=213バイトまで）
  assert.equal(encodeQr('あ'.repeat(71)).version, 10);
  assert.throws(() => encodeQr('あ'.repeat(72)), /長すぎ/);
});

test('QR: 大きさは 17+4×バージョン。位置検出パターン・タイミングパターン・暗いモジュールがある', () => {
  for (const n of [1, 20, 60, 100, 213]) {
    const q = encodeQr(bytes(n));
    assert.equal(q.size, 17 + 4 * q.version);
    const m = q.modules;
    const finder = (x, y) => {
      for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
        const edge = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        assert.equal(m[y + dy][x + dx], edge !== 2, `位置検出 (${x},${y}) ${dx},${dy}`);
      }
    };
    finder(0, 0);
    finder(q.size - 7, 0);
    finder(0, q.size - 7);
    for (let i = 8; i < q.size - 8; i++) {
      assert.equal(m[6][i], i % 2 === 0, `タイミング（横）${i}`);
      assert.equal(m[i][6], i % 2 === 0, `タイミング（縦）${i}`);
    }
    assert.equal(m[q.size - 8][8], true); // 常に暗いモジュール
  }
});

test('QR: 形式情報（誤り訂正レベルMとマスク）が2か所に正しく入っている（BCH符号の検査）', () => {
  for (const n of [5, 40, 100, 200]) {
    const q = encodeQr(bytes(n));
    const m = q.modules;
    const s = q.size;
    const bit = (x, y) => (m[y][x] ? 1 : 0);
    // 1か所目（左上）
    let a = 0;
    for (let i = 0; i <= 5; i++) a |= bit(8, i) << i;
    a |= bit(8, 7) << 6; a |= bit(8, 8) << 7; a |= bit(7, 8) << 8;
    for (let i = 9; i < 15; i++) a |= bit(14 - i, 8) << i;
    // 2か所目（右上・左下）
    let b = 0;
    for (let i = 0; i < 8; i++) b |= bit(s - 1 - i, 8) << i;
    for (let i = 8; i < 15; i++) b |= bit(8, s - 15 + i) << i;
    assert.equal(a, b);
    const f = a ^ 0x5412;
    assert.equal(f >> 13, 0, '誤り訂正レベルM（00）');
    assert.equal((f >> 10) & 7, q.mask);
    let rem = f; // 生成多項式 0x537 で割り切れる
    for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
    assert.equal(rem, 0);
  }
});

test('QR: バージョン7以上は、バージョン情報（18ビット）が2か所に入っている', () => {
  const q = encodeQr(bytes(150)); // バージョン8
  assert.equal(q.version, 8);
  const m = q.modules;
  let a = 0;
  let b = 0;
  for (let i = 0; i < 18; i++) {
    a |= (m[Math.floor(i / 3)][q.size - 11 + (i % 3)] ? 1 : 0) << i;
    b |= (m[q.size - 11 + (i % 3)][Math.floor(i / 3)] ? 1 : 0) << i;
  }
  assert.equal(a, b);
  assert.equal(a >> 12, 8);
  let rem = a; // 生成多項式 0x1F25 で割り切れる
  for (let i = 17; i >= 12; i--) if ((rem >> i) & 1) rem ^= 0x1f25 << (i - 12);
  assert.equal(rem, 0);
});

test('QR: 閲覧リンクの出力が、読み取りで確かめた期待値と一致する（変えると読めなくなる恐れ）', () => {
  const q = encodeQr(LINK);
  assert.equal(q.version, 4);
  assert.deepEqual(rowsOf(q), EXPECTED);
  assert.deepEqual(rowsOf(encodeQr(LINK)), EXPECTED); // 同じ入力なら同じ出力
});

test('QR: 内容が違えば出力も違う。リンクが1文字違うだけでも別のコードになる', () => {
  assert.notDeepEqual(rowsOf(encodeQr(LINK)), rowsOf(encodeQr(LINK.replace('2345', '2346'))));
});

test('QR の SVG: 周りに余白4モジュール・白地に黒・暗いモジュールの数だけ描く', () => {
  const q = encodeQr(LINK);
  const { svg, width, height } = qrSvg(q);
  assert.equal(width, (q.size + 8) * 10);
  assert.equal(height, width);
  assert.match(svg, /viewBox="0 0 41 41"/);
  assert.match(svg, /fill="#fff"/);
  assert.match(svg, /fill="#000"/);
  // 描いた面積（暗いモジュールの数）が、行列と一致する
  let area = 0;
  for (const m of svg.matchAll(/h(\d+)v1h-\1z/g)) area += Number(m[1]);
  assert.equal(area, q.modules.flat().filter(Boolean).length);
  // 余白: 最初の描画は4モジュール目から（0〜3は白）
  const xs = [...svg.matchAll(/M(\d+) (\d+)h/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(xs.every(([x, y]) => x >= 4 && y >= 4));
  assert.equal(svg.includes('<script'), false);
});
