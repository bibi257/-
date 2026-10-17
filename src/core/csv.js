// CSV の生成・解析

const BOM = '﻿';

/** 数式として解釈されうるセルは先頭に ' を付ける（CSVインジェクション対策） */
function guardFormula(s) {
  if (/^[=+@\t\r]/.test(s)) return `'${s}`;
  if (/^-/.test(s) && !/^-\d+(\.\d+)?$/.test(s)) return `'${s}`;
  return s;
}

export function escapeCell(v) {
  if (v === null || v === undefined) return '';
  const s = guardFormula(String(v));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 2次元配列を CSV 文字列にする（BOM 付き・CRLF） */
export function toCSV(rows, { bom = true } = {}) {
  return (bom ? BOM : '') + rows.map((r) => r.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}

/** RFC 4180 形式の CSV を解析する */
export function parseCSV(text) {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell); cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** バイト列を文字列にする。UTF-8 として不正なら Shift_JIS とみなす */
export function decodeText(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('shift_jis').decode(bytes);
  }
}

const NAME_HEADERS = ['名前', '氏名', '選手名', '参加者', '参加者名', 'name', 'player'];

/**
 * 名簿 CSV（または1行1名のテキスト）から名前の一覧を取り出す。
 * 1行目に「名前」「氏名」などの見出しがあれば、その列を使い見出し行は除く。なければ1列目。
 */
export function namesFromCSV(text) {
  const rows = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (!rows.length) return [];
  let col = 0;
  const head = rows[0].map((c) => c.trim().toLowerCase());
  const idx = head.findIndex((c) => NAME_HEADERS.includes(c));
  if (idx >= 0) { col = idx; rows.shift(); }
  return rows.map((r) => (r[col] ?? '').trim()).filter((s) => s !== '');
}
