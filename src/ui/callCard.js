// 「次に行う試合」の呼び出し札。卓名を大きく出し、当日の呼び出しにそのまま使えるようにする

import { h } from './io.js';
import { playerName, tableName } from '../core/state.js';
import { elapsedMinutes } from '../core/started.js';

export function nextItemHtml(st, m) {
  const table = m.tableId ? tableName(st, m.tableId) : '';
  const slot = m.timeSlot > 1 ? `<small>時間帯${m.timeSlot}</small>` : '';
  const running = !!m.startedAt;
  const run = running
    ? ` <span class="badge badge-running">進行中</span> <span class="ni-elapsed" data-started="${h(m.startedAt)}">${elapsedMinutes(m.startedAt)}分</span>`
    : '';
  // 「開始」「開始を取り消す」は運営だけ（閲覧者には進行中の表示だけ出る）
  const action = running
    ? `<button type="button" class="small" data-unstart="${h(m.id)}">開始を取り消す</button>`
    : `<button type="button" class="small" data-start="${h(m.id)}">開始</button>`;
  return `<div class="ni-card${running ? ' running' : ''}"><button type="button" class="next-item" data-match="${h(m.id)}">${table || slot ? `<span class="ni-table">${h(table)}${slot}</span>` : ''}` +
    `<span class="ni-body"><span class="ni-no">No.${m.no}${run}</span>` +
    `<span class="ni-players"><span data-pid="${h(m.p1)}">${h(playerName(st, m.p1))}</span><i>vs</i><span data-pid="${h(m.p2)}">${h(playerName(st, m.p2))}</span></span></span></button>` +
    `<span class="ni-actions owner-only">${action}</span></div>`;
}
