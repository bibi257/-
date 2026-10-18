// 試合結果一覧のカード表示（スマホ幅用）。表（table.results）と同じ行データ（exportData の *ResultRows）から作る。
// PC 幅では表、スマホ幅（700px 以下）ではカードを、CSS のメディアクエリで切り替える。CSV・PNG は表データのまま。

import { h } from './io.js';
import { statusBadge, matchStatusKey } from './badge.js';

/** 選手の ID（「自分の試合」の強調に使う） */
const pidAttr = (id) => (typeof id === 'string' ? ` data-pid="${h(id)}"` : '');

/** 勝った側（'p1' / 'p2' / null）。トーナメントは勝者の ID、総当たりは結果の勝敗から求める */
function winnerSide(m) {
  if (m.status !== 'done' && m.status !== 'bye') return null;
  if (m.result?.outcome === 'p1' || m.result?.outcome === 'p2') return m.result.outcome;
  if (m.winner !== undefined && m.winner !== null) return m.winner === m.p1 ? 'p1' : m.winner === m.p2 ? 'p2' : null;
  return null;
}

function scoreText(m) {
  const r = m.result;
  if (!r) return 'vs';
  if (r.walkover) return '不戦勝';
  if (r.score1 !== null && r.score1 !== undefined && r.score2 !== null && r.score2 !== undefined) return `${r.score1} － ${r.score2}`;
  return '－';
}

/** 1試合分のカード（<li>）。cells は *ResultRows の cells（番号・回戦・卓・時間帯・選手1・スコア・選手2・勝者/結果・状態） */
export function resultCardHtml({ match: m, cells }, { clickable }) {
  const [no, round, table, slot, p1, , p2, winnerName] = cells;
  const tag = clickable ? 'button type="button"' : 'div';
  const end = clickable ? 'button' : 'div';
  const attrs = `class="rc st-${h(m.status)}${clickable ? ' clickable' : ''}"${clickable ? ` data-match="${h(m.id)}"` : ''}`;
  const badge = `<span class="rc-badge">${statusBadge(matchStatusKey(m))}</span>`;
  // 不戦は1行に縮める
  if (m.status === 'bye') {
    return `<li><${tag} ${attrs}><span class="rc-bye"><span class="rc-win"${pidAttr(m.winner)}>${h(winnerName)}</span><span class="rc-bye-note">不戦で勝ち上がり</span></span>${badge}</${end}></li>`;
  }
  const meta = [no !== '' && no !== undefined && no !== null ? `No.${no}` : '', round, table, slot !== '' && slot !== undefined && slot !== null ? `時間帯${slot}` : '']
    .filter((x) => x !== '').map((x) => h(x)).join(' ・ ');
  const side = winnerSide(m);
  const player = (name, key) => `<span class="rc-p${side === key ? ' rc-win' : ''}"${pidAttr(m[key])}>${h(name)}</span>`;
  return `<li><${tag} ${attrs}><span class="rc-top"><span class="rc-meta">${meta}</span>${badge}</span>`
    + `<span class="rc-main">${player(p1, 'p1')}<span class="rc-score">${h(scoreText(m))}</span>${player(p2, 'p2')}</span></${end}></li>`;
}

/**
 * @param {{match:object, cells:any[]}[]} rows tournamentResultRows / leagueResultRows の戻り値
 * @param {(m:object) => boolean} isClickable 結果入力を開ける試合か
 */
export function resultCardsHtml(rows, isClickable = () => true, label = '試合結果の一覧') {
  return `<ul class="result-cards" aria-label="${h(label)}">${rows.map((r) => resultCardHtml(r, { clickable: isClickable(r.match) })).join('')}</ul>`;
}
