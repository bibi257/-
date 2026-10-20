// 「進行状況」の欄の、卓ごとのカード。卓の状況（空き／進行中）と、その卓の「次に行う試合」を1枚にまとめる。
// 左に卓名の帯、右に「今」と「次」の2行。ボタンは「今」の行の右端（空きの卓は「開始」、進行中の卓は「結果を入力」）。
// 閲覧者にも見える（ボタンは運営だけ）。卓が割り当てられていない試合は、卓のカードの下に「卓未定」として出す。

import { h } from './io.js';
import { nextItemHtml } from './callCard.js';
import { tableBoard, readyWithoutTable } from '../core/tableBoard.js';

// 選手の名前には ID を付ける（「自分の試合」の強調）
const vs = (m) => `<span class="tc-no">No.${m.no}</span><span class="tc-players"><span data-pid="${h(m.p1Id)}">${h(m.p1)}</span><i>vs</i><span data-pid="${h(m.p2Id)}">${h(m.p2)}</span></span>`;

function cardHtml(r) {
  const busy = r.state === 'busy';
  const now = busy
    ? `<button type="button" class="next-item tc-row" data-match="${h(r.running.id)}"><span class="tc-label">今</span><span class="badge badge-running">進行中</span>${vs(r.running)}<span class="tc-elapsed">（<span class="ni-elapsed" data-started="${h(r.running.startedAt)}">${r.running.minutes}分</span>）</span></button>`
    : `<span class="tc-row tc-idle"><span class="tc-label">今</span><b class="tc-free">空き</b></span>`;
  // ボタンは運営だけ。進行中の「開始の取り消し」は、結果入力シートの中にある
  const action = busy
    ? `<button type="button" class="small primary" data-match="${h(r.running.id)}">結果を入力</button>`
    : r.next ? `<button type="button" class="small primary" data-start="${h(r.next.id)}">開始</button>` : '';
  const next = r.next
    ? `<button type="button" class="next-item tc-row" data-match="${h(r.next.id)}"><span class="tc-label">次</span>${vs(r.next)}${r.next.timeSlot > 1 ? `<small class="tc-slot">時間帯${r.next.timeSlot}</small>` : ''}</button>`
    : `<span class="tc-row tc-idle"><span class="tc-label">次</span><span class="tc-none">この卓の試合はありません</span></span>`;
  return `<li class="tc ${busy ? 'busy' : 'free'}" data-table="${h(r.tableId)}"><span class="tc-name">${h(r.name)}</span>`
    + `<div class="tc-main"><div class="tc-line">${now}${action ? `<span class="tc-action owner-only">${action}</span>` : ''}</div><div class="tc-line">${next}</div></div></li>`;
}

/** @param {'tournament'|'league'} kind */
export function tableBoardHtml(st, kind) {
  const rows = tableBoard(st, kind);
  const loose = readyWithoutTable(st, kind);
  if (!rows.length && !loose.length) return '';
  const cards = rows.length ? `<ul class="table-board" aria-label="卓ごとの状況">${rows.map(cardHtml).join('')}</ul>` : '';
  // 卓が割り当てられていない次の試合（卓が1つも無い大会など）は、今までの札の形で出す
  const extra = loose.length
    ? `<p class="hint">卓未定の次の試合<span class="owner-only">（クリックで結果入力）</span></p><div class="next-list">${loose.map((m) => nextItemHtml(st, m)).join('')}</div>`
    : '';
  return cards + extra;
}
