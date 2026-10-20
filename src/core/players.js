// 参加者・卓の編集と入力チェック

export const MAX_NAME_LENGTH = 40;
export const MAX_TABLES = 50;

let counter = 0;
export function newId(prefix) {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 重複判定用の正規化（全角半角・大文字小文字・空白の違いを無視） */
export function nameKey(name) {
  return String(name).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

export function cleanName(name) {
  return String(name ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

export function makePlayers(names) {
  return names.map((name) => ({ id: newId('p'), name: cleanName(name) }));
}

/**
 * 名簿のチェック。
 * @returns {{errors:string[], invalidIds:Set<string>}}
 */
export function validatePlayers(players) {
  const errors = [];
  const invalidIds = new Set();
  const seen = new Map();
  players.forEach((p, i) => {
    if (!p.name.trim()) {
      errors.push(`${i + 1}番目の名前が空欄です`);
      invalidIds.add(p.id);
      return;
    }
    const key = nameKey(p.name);
    if (seen.has(key)) {
      errors.push(`「${p.name}」が重複しています（${seen.get(key) + 1}番目と${i + 1}番目）`);
      invalidIds.add(p.id);
    } else seen.set(key, i);
  });
  return { errors, invalidIds };
}

export function movePlayer(players, index, delta) {
  const j = index + delta;
  if (j < 0 || j >= players.length) return players;
  const a = [...players];
  [a[index], a[j]] = [a[j], a[index]];
  return a;
}

export function defaultTableName(i) {
  return `第${i + 1}卓`;
}

/** 卓数を変更する。既存の卓名は残す */
export function resizeTables(tables, count) {
  const n = Math.max(1, Math.min(MAX_TABLES, count | 0));
  const out = tables.slice(0, n);
  while (out.length < n) out.push({ id: newId('t'), name: defaultTableName(out.length) });
  return out;
}

/** 「参加者・設定」タブの3段階（1 大会情報と参加者／2 卓と形式／3 表を作成）の進み具合 */
export function setupProgress(state) {
  return {
    players: state.players.length >= 2, // 1: 対戦表を作れる人数がいる
    tables: state.tables.length >= 1 && state.tables.every((t) => t.name.trim() !== ''), // 2: 卓があり、すべてに名前がある
    created: !!(state.tournament || state.league), // 3: トーナメントか総当たりを作成済み
  };
}
