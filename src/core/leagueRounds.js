// 総当たりの「回戦ごと」表示と「選手ごと」の一覧（スマホ幅用）の判定。DOM に依存しない

import { resolveLeague } from './league.js';
import { matrixCell } from './exportData.js';
import { playerName, tableName } from './state.js';

/** タブになる回戦（1回戦…N回戦）。key は文字列 */
export function leagueRoundKeys(res) {
  return Array.from({ length: res.roundCount }, (_, k) => ({ key: String(k + 1), name: `${k + 1}回戦` }));
}

/** 最初に開く回戦: 試合待ち（結果が無い試合）がある最初の回戦。全部終わっていれば最後の回戦 */
export function defaultLeagueRoundKey(res) {
  const open = res.matches.find((m) => m.status === 'ready');
  return String(open ? open.round : Math.max(1, res.roundCount));
}

/** その回戦に休みの選手の名前（いなければ空） */
export function restNames(st, res, key) {
  return (res.rest[Number(key) - 1] ?? []).map((id) => playerName(st, id));
}

/**
 * 選んだ選手の対戦の一覧（回戦の順）。休みの回戦は含めない。
 * @returns {{match:object, round:number, opponentId:string, opponent:string, outcome:'win'|'loss'|'draw'|null, text:string, table:string}[]}
 *   text は総当たり表のマスと同じ（「○ 3-1」「× 不戦敗」。未実施は空）
 */
export function playerOpponentRows(st, playerId) {
  if (!st.league) return [];
  const res = resolveLeague(st.league, st.tables);
  return res.matches.filter((m) => m.p1 === playerId || m.p2 === playerId).map((m) => {
    const opponentId = m.p1 === playerId ? m.p2 : m.p1;
    const text = matrixCell(m, st.league.results[m.id], playerId);
    const outcome = { '○': 'win', '×': 'loss', '△': 'draw' }[text.charAt(0)] ?? null;
    return { match: m, round: m.round, opponentId, opponent: playerName(st, opponentId), outcome, text, table: m.tableId ? tableName(st, m.tableId) : '' };
  });
}
