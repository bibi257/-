// 表を矢印キーで動くときの、次の位置の決め方（ローピング tabindex 用。DOM に依存しない）

export const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];

/**
 * 行と列の表（マトリクス）で、キーを押したときの次のマス。動けないときは今のマスのまま。
 * 矢印キーは、進む向きにある「止まれるマス」（自分自身のマスなどは飛ばす）のうち、最も近いものへ。Home／End は行の先頭／最後の止まれるマスへ。
 * @param {{rows:number, cols:number, r:number, c:number, key:string, canFocus:(r:number, c:number) => boolean}} o
 * @returns {{r:number, c:number}}
 */
export function nextGridCell({ rows, cols, r, c, key, canFocus }) {
  const stay = { r, c };
  const scan = (from, to, step, at) => {
    for (let i = from; step > 0 ? i <= to : i >= to; i += step) if (canFocus(...at(i))) return at(i);
    return null;
  };
  let hit = null;
  if (key === 'ArrowRight') hit = scan(c + 1, cols - 1, 1, (i) => [r, i]);
  else if (key === 'ArrowLeft') hit = scan(c - 1, 0, -1, (i) => [r, i]);
  else if (key === 'ArrowDown') hit = scan(r + 1, rows - 1, 1, (i) => [i, c]);
  else if (key === 'ArrowUp') hit = scan(r - 1, 0, -1, (i) => [i, c]);
  else if (key === 'Home') hit = scan(0, cols - 1, 1, (i) => [r, i]);
  else if (key === 'End') hit = scan(cols - 1, 0, -1, (i) => [r, i]);
  return hit ? { r: hit[0], c: hit[1] } : stay;
}

/**
 * 1列の一覧（行の並び）で、キーを押したときの次の位置。上下の矢印・Home・End。端では動かない。
 * @returns {number} 新しい位置（count が 0 のときは -1）
 */
export function nextListIndex({ count, i, key }) {
  if (count <= 0) return -1;
  const at = Math.min(Math.max(i, 0), count - 1);
  if (key === 'ArrowDown') return Math.min(at + 1, count - 1);
  if (key === 'ArrowUp') return Math.max(at - 1, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return at;
}
