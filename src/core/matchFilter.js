// 総当たりの試合結果一覧の絞り込み（状態・回戦・卓・選手名）。画面に依存しない。
// 絞り込むのは画面の一覧だけで、CSV・PNG・印刷は全試合を出す（呼ぶ側が全行を使う）

export const MAX_NAME_FILTER = 40;
export const STATUS_FILTERS = [
  { value: 'all', label: 'すべて' },
  { value: 'pending', label: '未入力' },
  { value: 'done', label: '終了' },
];

export const defaultFilter = () => ({ status: 'all', round: 'all', table: 'all', name: '' });

/** 比較用に整える（全角・半角、大文字・小文字、空白の違いを無視する） */
const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');

/**
 * 保存されていた値や不正な値を、使える条件に直す。選べない値（なくなった回戦・卓など）は「すべて」に戻す
 * @param {unknown} raw
 * @param {{rounds:number[], tableIds:string[]}} choices 今選べる回戦と卓
 */
export function sanitizeFilter(raw, choices) {
  const f = defaultFilter();
  if (!raw || typeof raw !== 'object') return f;
  if (STATUS_FILTERS.some((s) => s.value === raw.status)) f.status = raw.status;
  if (typeof raw.round === 'string' && choices.rounds.some((r) => String(r) === raw.round)) f.round = raw.round;
  if (typeof raw.table === 'string' && choices.tableIds.includes(raw.table)) f.table = raw.table;
  if (typeof raw.name === 'string') f.name = raw.name.slice(0, MAX_NAME_FILTER);
  return f;
}

export const isFiltered = (f) => f.status !== 'all' || f.round !== 'all' || f.table !== 'all' || norm(f.name) !== '';

/**
 * 条件に合う行だけを返す。条件はすべて満たす（AND）。選手名は、選手1・選手2のどちらかに部分一致すればよい
 * @param {{match:{status:string, round:number, tableId:string|null}, cells:any[]}[]} rows leagueResultRows の戻り値
 */
export function filterRows(rows, f) {
  const q = norm(f.name);
  return rows.filter(({ match: m, cells }) => {
    if (f.status === 'done' && m.status !== 'done') return false;
    if (f.status === 'pending' && m.status === 'done') return false;
    if (f.round !== 'all' && String(m.round) !== f.round) return false;
    if (f.table !== 'all' && m.tableId !== f.table) return false;
    if (q && !norm(cells[4]).includes(q) && !norm(cells[6]).includes(q)) return false;
    return true;
  });
}

export const countText = (shown, total) => `${total}試合中 ${shown}試合を表示`;
