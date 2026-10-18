// SVG 生成。画面表示と PNG 出力で同じ関数を使う。
// measure(text, fontSize, bold) で文字幅を測る（ブラウザでは canvas、テストでは概算）。

import { resolveBracket, roundName } from '../core/bracket.js';
import { playerName, tableName } from '../core/state.js';
import { eventTitle } from '../core/edition.js';
import { formatEventDate } from '../core/schedule.js';
import { THEME as T } from './theme.js';

export const FONT_FAMILY = "'BIZ UDPGothic','Yu Gothic UI','Yu Gothic','Meiryo','Hiragino Sans','Noto Sans JP','Noto Sans CJK JP',sans-serif";

export function approxMeasure(text, size, bold = false) {
  let w = 0;
  for (const ch of String(text)) w += ch.codePointAt(0) > 0x2e80 ? size : size * 0.6;
  return w * (bold ? 1.05 : 1);
}

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function text(x, y, s, { size = 14, bold = false, color = T.text, anchor = 'start', cls = '' } = {}) {
  return `<text x="${x}" y="${y}" font-size="${size}"${bold ? ' font-weight="bold"' : ''} fill="${color}" text-anchor="${anchor}" dominant-baseline="central"${cls ? ` class="${cls}"` : ''}>${esc(s)}</text>`;
}

function line(x1, y1, x2, y2, color, width) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="square"/>`;
}

// 色は theme.js（web/style.css の :root と同じ値）から取る。勝ち上がりの線と勝者の枠は青（結果入力の勝者の行と同じ）
const C = {
  line: T.faint, win: T.primary, box: T.muted, boxFill: T.paper, winFill: T.primaryWeak,
  champFill: T.goldWeak, champ: T.goldLine, ready: T.primary, done: T.muted, waiting: T.faint, sub: T.muted,
};

function svgDoc(width, height, body, extraAttrs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${esc(FONT_FAMILY)}"${extraAttrs}>` +
    `<rect width="100%" height="100%" fill="${T.paper}"/>${body}</svg>`;
}

function footer(state, width, height) {
  const when = formatEventDate(state.meta.date, state.meta.time);
  const d = when ? `開催日時 ${when}　` : '';
  return text(width - 12, height - 14, `${d}出力 ${formatNow()}`, { size: 11, color: T.faint, anchor: 'end' });
}

export function formatNow(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function matchLabel(state, m) {
  const parts = [`No.${m.no}`];
  if (m.tableId) parts.push(tableName(state, m.tableId));
  if (m.result?.walkover) parts.push('不戦勝');
  return parts.join(' ');
}

/**
 * トーナメント表の SVG。
 * @param {object} state
 * @param {{measure?:Function, interactive?:boolean}} opts interactive なら試合ごとにクリック用の <g class="match"> を付ける
 */
export function bracketSvg(state, { measure = approxMeasure, interactive = false } = {}) {
  const t = state.tournament;
  const res = resolveBracket(t, state.tables);
  const R = res.roundCount;
  const rowH = 36;
  const boxH = 26;
  const nameW = Math.max(...t.playerIds.map((id) => measure(playerName(state, id), 14, true)), measure('（削除された参加者）', 14));
  const boxW = Math.round(Math.min(320, Math.max(120, nameW + 44)));
  const labels = res.playable.map((m) => measure(matchLabel(state, m), 11));
  const gap = Math.round(Math.max(64, (labels.length ? Math.max(...labels) : 0) + 30));
  const stub = 16;
  const left = 16;
  const top = 76;
  const colX = (k) => left + k * (boxW + gap);
  const width = colX(R) + boxW + 16;
  const thirdH = res.thirdPlace ? rowH * 2 + 56 : 0;
  const height = top + t.size * rowH + thirdH + 36;

  // 列ごとの枠の中心 y
  const ys = [Array.from({ length: t.size }, (_, j) => top + j * rowH + rowH / 2)];
  for (let k = 1; k <= R; k++) ys.push(ys[k - 1].filter((_, j) => j % 2 === 0).map((y, j) => (y + ys[k - 1][2 * j + 1]) / 2));

  const out = [];
  out.push(text(left, 24, `${eventTitle(state)}　トーナメント表`, { size: 20, bold: true }));
  for (let k = 0; k <= R; k++) {
    out.push(text(colX(k) + boxW / 2, top - 18, k < R ? roundName(k + 1, R) : '優勝', { size: 13, bold: true, color: C.sub, anchor: 'middle' }));
  }

  const box = (x, y, id, { score = '', state: st = 'normal' } = {}) => {
    const fill = st === 'win' ? C.winFill : st === 'champ' ? C.champFill : C.boxFill;
    const stroke = st === 'win' ? C.win : st === 'champ' ? C.champ : C.box;
    const color = st === 'lose' ? T.faint : T.text;
    const name = id === undefined ? '' : playerName(state, id);
    let s = `<rect x="${x}" y="${y - boxH / 2}" width="${boxW}" height="${boxH}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${st === 'win' || st === 'champ' ? 1.6 : 1}"/>`;
    if (name) s += text(x + 8, y, name, { size: 14, bold: st === 'win' || st === 'champ', color });
    if (score !== '') s += text(x + boxW - 8, y, score, { size: 13, bold: st === 'win', color, anchor: 'end' });
    return s;
  };

  const drawMatch = (m, k, y1, y2, yNext, xNextLeft) => {
    const x1 = colX(k) + boxW;
    const xm = x1 + stub;
    const yc = (y1 + y2) / 2;
    const parts = [];
    const sides = [['p1', y1], ['p2', y2]];
    const advanced = m.status === 'done' || m.status === 'bye';
    // 線
    for (const [side, y] of sides) {
      if (m[side] === null) continue;
      const isWin = advanced && m.winner === m[side];
      const col = isWin ? C.win : C.line;
      const w = isWin ? 2.5 : 1.2;
      parts.push(line(x1, y, xm, y, col, w));
      parts.push(line(xm, y, xm, yc, col, w));
    }
    if (m.status !== 'empty') {
      parts.push(line(xm, yc, xNextLeft, yNext, advanced ? C.win : C.line, advanced ? 2.5 : 1.2));
    }
    // 枠
    for (const [side, y] of sides) {
      const id = m[side];
      if (id === null) continue;
      const score = m.result && !m.result.walkover && m.result.score1 !== null ? String(side === 'p1' ? m.result.score1 : m.result.score2) : '';
      const st = m.status === 'done' ? (m.winner === id ? 'win' : 'lose') : 'normal';
      parts.push(box(colX(k), y, id, { score, state: st }));
    }
    // 試合番号・卓
    if (m.playable) {
      const color = m.status === 'ready' ? C.ready : m.status === 'done' ? C.done : C.waiting;
      parts.push(text(xm + 5, yc - 9, matchLabel(state, m), { size: 11, bold: m.status === 'ready', color }));
    }
    if (interactive && m.playable) {
      const label = `${m.isThirdPlace ? '3位決定戦' : roundName(m.round, R)} 試合${m.no}`;
      const hit = `<rect class="hit" x="${colX(k) - 3}" y="${y1 - boxH / 2 - 3}" width="${boxW + stub + 6}" height="${y2 - y1 + boxH + 6}" rx="6"/>`;
      return `<g class="match st-${m.status}" data-id="${esc(m.id)}" tabindex="0" role="button" aria-label="${esc(label)}">${hit}${parts.join('')}</g>`;
    }
    return parts.join('');
  };

  for (let k = 0; k < R; k++) {
    res.rounds[k].forEach((m, i) => {
      out.push(drawMatch(m, k, ys[k][2 * i], ys[k][2 * i + 1], ys[k + 1][i], colX(k + 1)));
    });
  }
  // 優勝
  const final = res.rounds[R - 1][0];
  const champ = final.status === 'done' || final.status === 'bye' ? final.winner : undefined;
  out.push(box(colX(R), ys[R][0], champ, { state: champ ? 'champ' : 'normal' }));

  // 3位決定戦
  if (res.thirdPlace) {
    const tp = res.thirdPlace;
    const y0 = top + t.size * rowH + 30;
    const k = Math.max(0, R - 1);
    out.push(text(colX(k), y0 - 6, '3位決定戦', { size: 13, bold: true, color: C.sub }));
    const y1 = y0 + rowH / 2 + 4;
    const y2 = y1 + rowH;
    out.push(drawMatch(tp, k, y1, y2, (y1 + y2) / 2, colX(k + 1)));
    const w3 = tp.status === 'done' || tp.status === 'bye' ? tp.winner : undefined;
    out.push(box(colX(k + 1), (y1 + y2) / 2, w3, { state: w3 ? 'champ' : 'normal' }));
    out.push(text(colX(k + 1) + boxW / 2, y0 - 6, '3位', { size: 13, bold: true, color: C.sub, anchor: 'middle' }));
  }
  out.push(footer(state, width, height));
  // columns: 各列（回戦・優勝）の左端の x。画面の「回戦へ移動」が使う
  return { svg: svgDoc(width, height, out.join('')), width, height, columns: Array.from({ length: R + 1 }, (_, k) => colX(k)) };
}

/**
 * 表の SVG（総当たり表・結果一覧・順位表の PNG 用）。
 * @param {{title:string, headers:any[], rows:any[][], note?:string}} table
 */
export function tableSvg(state, table, { measure = approxMeasure } = {}) {
  const size = 13;
  const pad = 10;
  const rowH = 28;
  const cols = table.headers.length;
  const widths = Array.from({ length: cols }, (_, c) => {
    let w = measure(table.headers[c], size, true);
    for (const r of table.rows) w = Math.max(w, measure(r[c] ?? '', size));
    return Math.ceil(Math.max(28, w) + pad * 2);
  });
  const left = 16;
  const top = 56;
  const tableW = widths.reduce((a, b) => a + b, 0);
  const titleW = measure(table.title, 20, true);
  const width = Math.ceil(Math.max(tableW, titleW, 360) + left * 2);
  const bodyH = (table.rows.length + 1) * rowH;
  const height = top + bodyH + (table.note ? 26 : 0) + 40;
  const out = [];
  out.push(text(left, 26, table.title, { size: 20, bold: true }));
  out.push(`<rect x="${left}" y="${top}" width="${tableW}" height="${rowH}" fill="${T.tableHead}"/>`);
  const isNum = (v) => typeof v === 'number' || /^[-\d.]+$/.test(String(v));
  let x = left;
  for (let c = 0; c < cols; c++) {
    const w = widths[c];
    out.push(text(x + w / 2, top + rowH / 2, table.headers[c], { size, bold: true, anchor: 'middle' }));
    table.rows.forEach((r, i) => {
      const v = r[c] ?? '';
      const y = top + (i + 1) * rowH + rowH / 2;
      const center = isNum(v) || String(v).length <= 3;
      out.push(text(center ? x + w / 2 : x + pad, y, v, { size, anchor: center ? 'middle' : 'start' }));
    });
    x += w;
  }
  // 1〜3位の帯（大会が終わった順位表。画面と同じ金・銀・銅）
  const medalColor = { gold: T.medalGold, silver: T.medalSilver, bronze: T.medalBronze };
  (table.rowMedals || []).forEach((m, i) => {
    if (medalColor[m]) out.push(`<rect x="${left}" y="${top + (i + 1) * rowH}" width="4" height="${rowH}" fill="${medalColor[m]}"/>`);
  });
  // 罫線
  for (let i = 0; i <= table.rows.length + 1; i++) out.push(line(left, top + i * rowH, left + tableW, top + i * rowH, T.rule, 1));
  x = left;
  for (let c = 0; c <= cols; c++) {
    out.push(line(x, top, x, top + bodyH, T.rule, 1));
    x += widths[c] ?? 0;
  }
  if (table.note) out.push(text(left, top + bodyH + 16, table.note, { size: 11, color: T.muted }));
  out.push(footer(state, width, height));
  return { svg: svgDoc(width, height, out.join('')), width, height };
}
