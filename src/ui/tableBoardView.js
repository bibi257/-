// 「進行状況」の欄の、卓の状況（空き／進行中）。閲覧者にも見える。

import { h } from './io.js';
import { tableBoard } from '../core/tableBoard.js';

/** @param {'tournament'|'league'} kind */
export function tableBoardHtml(st, kind) {
  const rows = tableBoard(st, kind);
  if (!rows.length) return '';
  const vs = (m) => `No.${m.no} ${h(m.p1)} vs ${h(m.p2)}`;
  return `<ul class="table-board" aria-label="卓の状況">${rows.map((r) => (r.state === 'busy'
    ? `<li class="tb busy"><span class="tb-name">${h(r.name)}</span><span class="tb-state"><span class="badge badge-running">進行中</span> ${vs(r.running)}（<span class="ni-elapsed" data-started="${h(r.running.startedAt)}">${r.running.minutes}分</span>）</span></li>`
    : `<li class="tb free"><span class="tb-name">${h(r.name)}</span><span class="tb-state"><span class="tb-free">空き</span>${r.next ? `<span class="tb-next">次：${vs(r.next)}</span>` : ''}</span></li>`)).join('')}</ul>`;
}
