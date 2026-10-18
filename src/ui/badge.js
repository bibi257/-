// 試合の状態を示すバッジ（試合結果一覧など、状態を出す画面で共用する）。
// 色だけに頼らず、文字で状態を示す。見た目は web/style.css の .badge-*:
//   試合待ち＝青の塗り／終了＝灰の枠／対戦者未定＝点線の枠／不戦＝灰の文字だけ

import { h } from './io.js';
import { STATUS } from '../core/exportData.js';

/** バッジを出す状態（表に出さない 'empty' を除く） */
export const BADGE_STATUSES = ['ready', 'done', 'waiting', 'bye'];

/** @param {string} status 試合の状態（ready / done / waiting / bye） */
export function statusBadge(status) {
  if (!BADGE_STATUSES.includes(status)) return '';
  return `<span class="badge badge-${status}">${h(STATUS[status])}</span>`;
}
