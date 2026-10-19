// 「元に戻す」の履歴。直前の大会データ（置き換える前の値）を、新しいものから順に最大 MAX_UNDO 件持つ。
// 大会データは core の関数で新しい値に置き換える作りなので、前の値をそのまま持てばよい（コピーは不要）。

export const MAX_UNDO = 20;
/** 入力欄の連続した入力を1回の操作にまとめる間隔（ミリ秒） */
export const MERGE_MS = 1200;

/** 空の履歴 */
export function createUndo() {
  return { stack: [], mergedAt: 0 };
}

/** 保存の時刻（meta.updatedAt）を除いて、内容が同じか */
export function sameContent(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const strip = (s) => JSON.stringify({ ...s, meta: s.meta ? { ...s.meta, updatedAt: '' } : undefined });
  return strip(a) === strip(b);
}

/**
 * 大会データを prev から next に置き換えるときの履歴の更新。
 * 内容が変わらないときは残さない。merge（入力欄の入力）は、直前の入力から MERGE_MS 以内なら、前の入力と1つにまとめる。
 * @returns {{stack:object[], mergedAt:number}} 新しい履歴（変えないときは同じ値）
 */
export function recordChange(history, prev, next, { merge = false, now = Date.now() } = {}) {
  if (!prev || sameContent(prev, next)) return history;
  if (merge && history.mergedAt && now - history.mergedAt <= MERGE_MS) {
    return { stack: history.stack, mergedAt: now }; // 前の入力の履歴に含める
  }
  const stack = [...history.stack, prev];
  if (stack.length > MAX_UNDO) stack.shift(); // 古いものから捨てる
  return { stack, mergedAt: merge ? now : 0 };
}

/** 1つ戻す。戻す先がなければ null */
export function popUndo(history) {
  if (!history.stack.length) return null;
  const stack = history.stack.slice(0, -1);
  return { state: history.stack[history.stack.length - 1], history: { stack, mergedAt: 0 } };
}

export const canUndo = (history) => history.stack.length > 0;
