// 「元に戻す」で戻る操作の名前（「結果の保存（No.3）」など）。前後の大会データを比べて決める。DOM に依存しない

import { resolveBracket } from './bracket.js';
import { resolveLeague } from './league.js';

export const DEFAULT_LABEL = '直前の操作';

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const keys = (o) => Object.keys(o ?? {});

/** その種類（tournament / league）の試合番号。見つからなければ空 */
function matchNo(st, kind, id) {
  try {
    const matches = kind === 'league' ? resolveLeague(st.league, st.tables).matches : resolveBracket(st.tournament, st.tables).matches;
    const no = matches.find((m) => m.id === id)?.no;
    return no ? `（No.${no}）` : '';
  } catch {
    return '';
  }
}

/** 結果が変わった試合（追加・変更は added、取り消しは removed）。複数あるときは、番号が最初のもの */
function resultChange(prev, next, kind) {
  const a = prev[kind]?.results;
  const b = next[kind]?.results;
  if (!prev[kind] || !next[kind] || same(a, b)) return null;
  const ids = [...new Set([...keys(a), ...keys(b)])].filter((id) => !same(a?.[id], b?.[id]));
  const added = ids.filter((id) => b?.[id]);
  if (added.length) return { kind: 'save', id: added[0] };
  return ids.length ? { kind: 'clear', id: ids[0] } : null;
}

/** 開始（進行中）が変わった試合 */
function startChange(prev, next, kind) {
  const a = prev[kind]?.started;
  const b = next[kind]?.started;
  if (!prev[kind] || !next[kind] || same(a, b)) return null;
  const added = keys(b).filter((id) => !a?.[id]);
  if (added.length) return { kind: 'start', id: added[0] };
  const removed = keys(a).filter((id) => !b?.[id]);
  return removed.length ? { kind: 'unstart', id: removed[0] } : null;
}

/**
 * 大会データを prev から next に置き換える操作の名前。
 * @returns {string} 例:「結果の保存（No.3）」「試合の開始（No.1）」「参加者の変更」。分からなければ「直前の操作」
 */
export function describeChange(prev, next) {
  if (!prev || !next) return DEFAULT_LABEL;
  for (const kind of ['tournament', 'league']) {
    const r = resultChange(prev, next, kind);
    if (r) return `${r.kind === 'save' ? '結果の保存' : '結果の取消'}${matchNo(r.kind === 'save' ? next : prev, kind, r.id)}`;
  }
  for (const kind of ['tournament', 'league']) {
    const s = startChange(prev, next, kind);
    if (s) return `${s.kind === 'start' ? '試合の開始' : '開始の取り消し'}${matchNo(next.tournament || next.league ? next : prev, kind, s.id)}`;
  }
  for (const kind of ['tournament', 'league']) {
    if (!same(prev[kind]?.tableOverrides, next[kind]?.tableOverrides) && prev[kind] && next[kind]) return '卓の変更';
  }
  if (!same(prev.tournament, next.tournament) || !same(prev.league, next.league)) {
    const made = (!prev.tournament && next.tournament) || (!prev.league && next.league);
    const gone = (prev.tournament && !next.tournament) || (prev.league && !next.league);
    if (made) return '表の作成';
    if (gone) return '表の削除';
    return '表の変更';
  }
  if (!same(prev.players, next.players)) {
    const strip = (ps) => (ps ?? []).map(({ absent, ...rest }) => rest);
    return same(strip(prev.players), strip(next.players)) ? '出欠の変更' : '参加者の変更';
  }
  if (!same(prev.tables, next.tables)) return '卓の変更';
  if (!same(prev.settings, next.settings)) return '設定の変更';
  if (!same({ ...prev.meta, updatedAt: '' }, { ...next.meta, updatedAt: '' })) return '大会名・開催日時の変更';
  return DEFAULT_LABEL;
}
