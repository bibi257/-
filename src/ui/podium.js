// トーナメントタブの最上部に出す表彰のカード（優勝・準優勝・3位）。決勝（と3位決定戦）が終わったときだけ出る。
// 色は金・銀・銅の帯（順位表と同じ色）。動きは付けない。

import { h } from './io.js';
import { tournamentPodium } from '../core/bracket.js';
import { playerName } from '../core/state.js';

/** 表彰のカードの HTML。まだ終わっていなければ空文字 */
export function podiumHtml(st, res) {
  const p = tournamentPodium(st.tournament, res);
  if (!p) return '';
  const names = (ids) => ids.map((id) => `<span class="podium-name">${h(playerName(st, id))}</span>`).join('');
  const row = (cls, label, ids) => `<div class="podium-row ${cls}"><span class="podium-label">${label}</span>${names(ids)}</div>`;
  return `<section class="card podium" aria-label="表彰">
    <h2>表彰</h2>
    ${row('gold', '優勝', [p.first])}
    ${p.second ? row('silver', '準優勝', [p.second]) : ''}
    ${p.thirds.length ? row('bronze', '3位', p.thirds) : ''}
  </section>`;
}
