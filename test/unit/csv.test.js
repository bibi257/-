import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCSV, parseCSV, escapeCell, decodeText, namesFromCSV } from '../../src/core/csv.js';

test('CSV: BOM付き・CRLF・エスケープ', () => {
  const s = toCSV([['名前', '備考'], ['山田 太郎', 'a,b'], ['"引用"', '改行\nあり']]);
  assert.ok(s.startsWith('﻿'));
  assert.equal(s, '﻿名前,備考\r\n山田 太郎,"a,b"\r\n"""引用""","改行\nあり"\r\n');
});

test('CSV: 数式になりうるセルを無害化、数値はそのまま', () => {
  assert.equal(escapeCell('=1+1'), "'=1+1");
  assert.equal(escapeCell('+81'), "'+81");
  assert.equal(escapeCell('@SUM'), "'@SUM");
  assert.equal(escapeCell('-abc'), "'-abc");
  assert.equal(escapeCell('-3'), '-3');
  assert.equal(escapeCell(3), '3');
  assert.equal(escapeCell(null), '');
});

test('CSV: 解析（引用符・改行・CRLF・BOM）と往復', () => {
  const rows = [['a', 'b,c', 'd"e'], ['日本語', '', '複数\n行']];
  assert.deepEqual(parseCSV(toCSV(rows)), rows);
  assert.deepEqual(parseCSV('x,y\ny,z'), [['x', 'y'], ['y', 'z']]);
  assert.deepEqual(parseCSV(''), []);
});

test('文字コード: UTF-8 と Shift_JIS を判別', () => {
  const utf8 = new TextEncoder().encode('﻿名前\n山田');
  assert.equal(decodeText(utf8), '名前\n山田');
  // 「山田」の Shift_JIS: 8E 52 93 63
  const sjis = new Uint8Array([0x8e, 0x52, 0x93, 0x63]);
  assert.equal(decodeText(sjis), '山田');
});

test('名簿取込: 見出しの検出と列選択、空行除去', () => {
  assert.deepEqual(namesFromCSV('名前\n山田\n\n佐藤\n'), ['山田', '佐藤']);
  assert.deepEqual(namesFromCSV('学年,氏名\n1,山田\n2, 佐藤 \n'), ['山田', '佐藤']);
  assert.deepEqual(namesFromCSV('山田,1年\n佐藤,2年'), ['山田', '佐藤']);
  assert.deepEqual(namesFromCSV('Name\r\nAlice\r\nBob'), ['Alice', 'Bob']);
  assert.deepEqual(namesFromCSV(''), []);
});
