// 試合の「開始」（進行中）。開始時刻（ISO 文字列）は大会データの tournament.started / league.started に、試合 ID をキーにして持つ。
// 結果が入ったとき・対戦者が変わったときは無効になる。ここは日時の検査と経過時間だけ（試合の状態は bracket.js・league.js が導出する）。

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** 開始時刻として使える ISO 文字列か（例: 2026-10-18T05:30:00.000Z） */
export const isStartTime = (s) => typeof s === 'string' && ISO.test(s) && !Number.isNaN(Date.parse(s));

/** 開始してからの経過時間（分、切り捨て）。時計のずれで負になるときは0 */
export function elapsedMinutes(startedAt, now = Date.now()) {
  const ms = now - Date.parse(startedAt);
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 60000)) : 0;
}

/**
 * 導出した試合に startedAt を付ける。まだ結果がなく（status が ready）、開始したときと同じ対戦者のときだけ有効。
 * @param {{id:string, status:string, p1:any, p2:any, startedAt?:string|null}} m
 * @param {Record<string, {at:string, p1?:string, p2?:string}>|undefined} started
 * @param {boolean} checkPlayers 開始時の対戦者との一致も見るか（トーナメントは、前の試合の結果で対戦者が変わりうる）
 */
export function applyStarted(m, started, checkPlayers) {
  m.startedAt = null;
  if (m.status !== 'ready') return;
  const s = started?.[m.id];
  if (!s || !isStartTime(s.at)) return;
  if (checkPlayers && (s.p1 !== m.p1 || s.p2 !== m.p2)) return;
  m.startedAt = s.at;
}
