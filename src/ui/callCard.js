// 「次に行う試合」の呼び出し札。卓名を大きく出し、当日の呼び出しにそのまま使えるようにする

import { h } from './io.js';
import { playerName, tableName } from '../core/state.js';

export function nextItemHtml(st, m) {
  const table = m.tableId ? tableName(st, m.tableId) : '';
  const slot = m.timeSlot > 1 ? `<small>時間帯${m.timeSlot}</small>` : '';
  return `<button type="button" class="next-item" data-match="${h(m.id)}">${table || slot ? `<span class="ni-table">${h(table)}${slot}</span>` : ''}` +
    `<span class="ni-body"><span class="ni-no">No.${m.no}</span>` +
    `<span class="ni-players">${h(playerName(st, m.p1))}<i>vs</i>${h(playerName(st, m.p2))}</span></span></button>`;
}
