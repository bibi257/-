// トーナメント表の最初の倍率（画面に依存しない計算）

/** 倍率がこの値より小さくなるときは、文字が小さくなりすぎるので、縮めずに 100% で出す */
export const FIT_MIN = 0.75;

/**
 * 表を初めて表示するときの倍率。
 * 「枠の幅 ÷ 表の幅」が FIT_MIN 以上なら、その倍率（100% を上限）で表示する。FIT_MIN 未満（人数が多い）なら 100%。
 * 枠の幅が分からない（0 や非表示）ときも 100%。
 * @param {number} frameWidth 表を入れる枠の幅（px）
 * @param {number} naturalWidth 表の元の幅（px）
 * @returns {number} 倍率（1 = 100%）
 */
export function initialBracketScale(frameWidth, naturalWidth) {
  if (!(frameWidth > 0) || !(naturalWidth > 0)) return 1;
  const ratio = frameWidth / naturalWidth;
  if (ratio >= 1) return 1;
  return ratio >= FIT_MIN ? ratio : 1;
}
