// QRコードの生成（外部ライブラリなし）。バイトモード・誤り訂正レベルM・バージョン1〜10（UTF-8で最大213バイト）。
// 閲覧リンクのような短い文字列を、会場で見せる・掲示するために使う。仕様: ISO/IEC 18004。

/** 入れられる最大のバイト数（バージョン10・レベルM） */
export const QR_MAX_BYTES = 213;

// レベルMの、バージョンごとの構成: [誤り訂正の語数（1ブロック）, [ブロック数, データ語数] のグループ…]
const VERSIONS = [
  null,
  { ec: 10, groups: [[1, 16]] },
  { ec: 16, groups: [[1, 28]] },
  { ec: 26, groups: [[1, 44]] },
  { ec: 18, groups: [[2, 32]] },
  { ec: 24, groups: [[2, 43]] },
  { ec: 16, groups: [[4, 27]] },
  { ec: 18, groups: [[4, 31]] },
  { ec: 22, groups: [[2, 38], [2, 39]] },
  { ec: 22, groups: [[3, 36], [2, 37]] },
  { ec: 26, groups: [[4, 43], [1, 44]] },
];
// 位置合わせパターンの中心の座標
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const FORMAT_LEVEL_M = 0; // 誤り訂正レベルMの表示ビット

const dataCodewords = (v) => VERSIONS[v].groups.reduce((n, [blocks, len]) => n + blocks * len, 0);

// ---- GF(256)上のリード・ソロモン符号 ----
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** 次数 degree の生成多項式の係数（最高次を除く） */
function rsGenerator(degree) {
  const poly = new Uint8Array(degree);
  poly[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      poly[j] = gfMul(poly[j], root);
      if (j + 1 < degree) poly[j] ^= poly[j + 1];
    }
    root = gfMul(root, 2);
  }
  return poly;
}

/** データ語から、誤り訂正の語を求める */
export function rsRemainder(data, degree) {
  const gen = rsGenerator(degree);
  const out = new Uint8Array(degree);
  for (const b of data) {
    const factor = b ^ out[0];
    out.copyWithin(0, 1);
    out[degree - 1] = 0;
    for (let i = 0; i < degree; i++) out[i] ^= gfMul(gen[i], factor);
  }
  return out;
}

// ---- データの符号化 ----
function utf8(text) {
  return new TextEncoder().encode(text);
}

/** 文字列を、バージョンに合わせたデータ語（終端・埋め草つき）にする */
function encodeData(bytes, version) {
  const bits = [];
  const push = (value, count) => { for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(0b0100, 4); // バイトモード
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capacity = dataCodewords(version) * 8;
  push(0, Math.min(4, capacity - bits.length)); // 終端
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; out.length < dataCodewords(version); pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/** データ語をブロックに分けて誤り訂正を付け、交互に並べる */
function interleave(data, version) {
  const { ec, groups } = VERSIONS[version];
  const blocks = [];
  let pos = 0;
  for (const [count, len] of groups) {
    for (let i = 0; i < count; i++) {
      const d = data.slice(pos, pos + len);
      pos += len;
      blocks.push({ data: d, ec: rsRemainder(d, ec) });
    }
  }
  const out = [];
  const longest = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.ec[i]);
  return out;
}

// ---- 行列 ----
const getBit = (x, i) => ((x >>> i) & 1) !== 0;

function newGrid(size) {
  return { size, dark: Array.from({ length: size }, () => new Array(size).fill(false)), fn: Array.from({ length: size }, () => new Array(size).fill(false)) };
}

function setFn(g, x, y, dark) {
  g.dark[y][x] = dark;
  g.fn[y][x] = true;
}

function drawFinder(g, cx, cy) {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= g.size || y >= g.size) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFn(g, x, y, dist !== 2 && dist !== 4);
    }
  }
}

function drawAlign(g, cx, cy) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) setFn(g, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
}

function drawFormat(g, mask) {
  const data = (FORMAT_LEVEL_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const size = g.size;
  for (let i = 0; i <= 5; i++) setFn(g, 8, i, getBit(bits, i));
  setFn(g, 8, 7, getBit(bits, 6));
  setFn(g, 8, 8, getBit(bits, 7));
  setFn(g, 7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i++) setFn(g, 14 - i, 8, getBit(bits, i));
  for (let i = 0; i < 8; i++) setFn(g, size - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i++) setFn(g, 8, size - 15 + i, getBit(bits, i));
  setFn(g, 8, size - 8, true); // 常に暗いモジュール
}

function drawVersion(g, version) {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const a = g.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFn(g, a, b, getBit(bits, i));
    setFn(g, b, a, getBit(bits, i));
  }
}

function drawFunctionPatterns(g, version) {
  const size = g.size;
  for (let i = 0; i < size; i++) {
    setFn(g, 6, i, i % 2 === 0); // タイミングパターン
    setFn(g, i, 6, i % 2 === 0);
  }
  drawFinder(g, 3, 3);
  drawFinder(g, size - 4, 3);
  drawFinder(g, 3, size - 4);
  const pos = ALIGN[version];
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) continue; // 位置検出パターンと重なる
      drawAlign(g, pos[i], pos[j]);
    }
  }
  drawFormat(g, 0); // 場所を確保する（本当の値はマスクを決めたあとに書く）
  drawVersion(g, version);
}

function drawCodewords(g, codewords) {
  const size = g.size;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!g.fn[y][x] && i < codewords.length * 8) {
          g.dark[y][x] = getBit(codewords[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(g, mask) {
  for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) if (!g.fn[y][x] && MASKS[mask](x, y)) g.dark[y][x] = !g.dark[y][x];
}

/** 読み取りにくさの点数（小さいほど良い）。仕様の4つの規則 */
function penalty(g) {
  const { size, dark } = g;
  let score = 0;
  const line = (get) => {
    let run = 1;
    for (let i = 1; i < size; i++) {
      if (get(i) === get(i - 1)) run++;
      else { if (run >= 5) score += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) score += 3 + (run - 5);
    // 暗1:明1:暗3:明1:暗1 の前後に明4つ
    const bits = [];
    for (let i = 0; i < size; i++) bits.push(get(i) ? 1 : 0);
    const s = bits.join('');
    for (const pat of ['10111010000', '00001011101']) {
      let at = s.indexOf(pat);
      while (at !== -1) { score += 40; at = s.indexOf(pat, at + 1); }
    }
  };
  for (let y = 0; y < size; y++) line((i) => dark[y][i]);
  for (let x = 0; x < size; x++) line((i) => dark[i][x]);
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = dark[y][x];
      if (c === dark[y][x + 1] && c === dark[y + 1][x] && c === dark[y + 1][x + 1]) score += 3;
    }
  }
  let count = 0;
  for (const row of dark) for (const c of row) if (c) count++;
  const total = size * size;
  score += Math.floor(Math.abs(count * 20 - total * 10) / total) * 10;
  return score;
}

/**
 * 文字列からQRコードを作る。入らないほど長いときは例外にする。
 * @param {string} text
 * @returns {{version:number, size:number, mask:number, modules:boolean[][]}} modules[行][列] が true なら暗いモジュール
 */
export function encodeQr(text) {
  const bytes = utf8(String(text));
  if (!bytes.length) throw new Error('QRコードにする文字列が空です');
  let version = 1;
  while (version <= 10 && bytes.length > dataCodewords(version) - (version <= 9 ? 2 : 3)) version++;
  if (version > 10) throw new Error('リンクが長すぎて、QRコードにできません');
  const codewords = interleave(encodeData(bytes, version), version);
  const size = 17 + version * 4;
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const g = newGrid(size);
    drawFunctionPatterns(g, version);
    drawCodewords(g, codewords);
    applyMask(g, mask);
    drawFormat(g, mask);
    const score = penalty(g);
    if (!best || score < best.score) best = { score, mask, g };
  }
  return { version, size, mask: best.mask, modules: best.g.dark };
}
