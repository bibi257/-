// 卓ごとの状況（空き／進行中）。「進行状況」の欄と呼び出し画面に出す。

import { resolveBracket, tournamentProgress, roundName } from './bracket.js';
import { resolveLeague, leagueProgress } from './league.js';
import { playerName, tableName } from './state.js';
import { elapsedMinutes } from './started.js';

/**
 * @param {object} st 大会データ
 * @param {'tournament'|'league'} kind
 * @param {number} now 今の時刻（ミリ秒）
 * @returns {{tableId:string, name:string, state:'busy'|'free',
 *   running:null|{id:string, no:number, label:string, p1:string, p2:string, p1Id:string, p2Id:string, startedAt:string, minutes:number},
 *   next:null|{id:string, no:number, label:string, timeSlot:number, p1:string, p2:string}}[]}
 *   busy: 進行中の試合がある卓。free: 空いている卓。next は、どちらの卓でも、その卓に割り当てられた「次に行う試合」（まだ開始していない試合のうち番号が最も小さいもの）
 */
export function tableBoard(st, kind, now = Date.now()) {
  let ready;
  let labelOf;
  if (kind === 'league' && st.league) {
    ready = leagueProgress(resolveLeague(st.league, st.tables)).ready;
    labelOf = (m) => `${m.round}回戦`;
  } else if (kind === 'tournament' && st.tournament) {
    const res = resolveBracket(st.tournament, st.tables);
    ready = tournamentProgress(res).ready;
    labelOf = (m) => (m.isThirdPlace ? '3位決定戦' : roundName(m.round, res.roundCount));
  } else {
    return [];
  }
  const info = (m) => ({ id: m.id, no: m.no, label: labelOf(m), timeSlot: m.timeSlot ?? 0, p1: playerName(st, m.p1), p2: playerName(st, m.p2), p1Id: m.p1, p2Id: m.p2 });
  return st.tables.map((t) => {
    const mine = ready.filter((m) => m.tableId === t.id).sort((a, b) => a.no - b.no);
    const run = mine.find((m) => m.startedAt);
    const next = mine.find((m) => !m.startedAt);
    return {
      tableId: t.id,
      name: t.name,
      state: run ? 'busy' : 'free',
      running: run ? { ...info(run), startedAt: run.startedAt, minutes: elapsedMinutes(run.startedAt, now) } : null,
      next: next ? info(next) : null,
    };
  });
}

/**
 * 卓が割り当てられていない「次に行う試合」（卓が1つも無い大会など）。卓ごとのカードに載せられない試合を、別に出すために使う。
 * @returns {object[]} 解決済みの試合（番号順）
 */
export function readyWithoutTable(st, kind) {
  let ready;
  if (kind === 'league' && st.league) ready = leagueProgress(resolveLeague(st.league, st.tables)).ready;
  else if (kind === 'tournament' && st.tournament) ready = tournamentProgress(resolveBracket(st.tournament, st.tables)).ready;
  else return [];
  return ready.filter((m) => !m.tableId).sort((a, b) => a.no - b.no);
}

/** その試合の卓で、すでに別の試合が進行中なら、その試合（開始の確認に使う） */
export function busyOnSameTable(st, kind, matchId, now = Date.now()) {
  let ready;
  if (kind === 'league' && st.league) ready = leagueProgress(resolveLeague(st.league, st.tables)).ready;
  else if (kind === 'tournament' && st.tournament) ready = tournamentProgress(resolveBracket(st.tournament, st.tables)).ready;
  else return null;
  const m = ready.find((x) => x.id === matchId);
  if (!m) return null;
  const other = ready.find((x) => x.id !== matchId && m.tableId && x.tableId === m.tableId && x.startedAt);
  return other ? { table: tableName(st, other.tableId), no: other.no, p1: playerName(st, other.p1), p2: playerName(st, other.p2), minutes: elapsedMinutes(other.startedAt, now) } : null;
}
