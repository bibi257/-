// スマホ幅の「回戦ごと」表示: 回戦名のタブ＋選んだ回戦の試合カード。DOM に触れない部品（単体テストできる）。
// カードは試合結果一覧と同じ部品（resultCards.js）。

import { roundName } from '../core/bracket.js';
import { h } from './io.js';
import { resultCardsHtml } from './resultCards.js';

export const THIRD_KEY = 'third';

/** タブになる回戦（1回戦…決勝、あれば3位決定戦）。key は文字列 */
export function roundKeys(res) {
  const R = res.roundCount;
  const keys = Array.from({ length: R }, (_, k) => ({ key: String(k + 1), name: roundName(k + 1, R) }));
  if (res.thirdPlace && res.thirdPlace.status !== 'empty') keys.push({ key: THIRD_KEY, name: '3位決定戦' });
  return keys;
}

/** 最初に開く回戦: 試合待ちがある最初の回戦。無ければ（全部終わったとき）決勝 */
export function defaultRoundKey(res) {
  const R = res.roundCount;
  for (let k = 1; k <= R; k++) {
    if (res.rounds[k - 1].some((m) => m.status === 'ready')) return String(k);
  }
  if (res.thirdPlace?.status === 'ready') return THIRD_KEY;
  return String(R);
}

/** 選んだ回戦（無効なら最初に開く回戦） */
export function pickRoundKey(selected, keys, res) {
  return selected && keys.some((k) => k.key === selected) ? selected : defaultRoundKey(res);
}

/** その回戦の試合の行（tournamentResultRows の行から選ぶ） */
export function rowsForRound(rows, key) {
  return rows.filter(({ match: m }) => (key === THIRD_KEY ? !!m.isThirdPlace : !m.isThirdPlace && String(m.round) === key));
}

/** 回戦名のタブ（横に並べ、はみ出したら横にスクロール） */
export function roundTabsHtml(keys, selected) {
  return `<div class="round-tabs" role="tablist" aria-label="回戦">${keys.map(({ key, name }) =>
    `<button type="button" role="tab" data-round-tab="${h(key)}" aria-selected="${key === selected}">${h(name)}</button>`).join('')}</div>`;
}

/** 回戦ごとの表示の中身（タブ＋カード） */
export function roundViewHtml(res, rows, selected) {
  const keys = roundKeys(res);
  const key = pickRoundKey(selected, keys, res);
  return roundTabsHtml(keys, key) + resultCardsHtml(rowsForRound(rows, key), (m) => m.playable, `${keys.find((k) => k.key === key)?.name ?? ''}の試合`);
}
