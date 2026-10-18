// 「自分の試合」（共有の閲覧者・運営が、自分の名前を選んで、次の試合や成績を見る）。DOM に依存しない判定だけ置く。

import { resolveBracket, tournamentRanking, roundName } from './bracket.js';
import { resolveLeague, leagueStandings } from './league.js';
import { playerName, tableName } from './state.js';

/** 名前の比較用に整える（全角・半角、大文字・小文字、空白の違いを無視する） */
const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');

/** 入力した文字が、参加者の名前とちょうど一致するなら、その参加者の ID（なければ null）。一致が複数なら null */
export function pickPlayerByName(players, text) {
  const q = norm(text);
  if (!q) return null;
  const hits = players.filter((p) => norm(p.name) === q);
  return hits.length === 1 ? hits[0].id : null;
}

/** 保存しておいた選択（ID と名前）を、今の名簿から探す。ID が同じ人、いなければ名前が同じ人 */
export function resolveSaved(players, saved) {
  if (!saved || typeof saved !== 'object') return null;
  const byId = typeof saved.id === 'string' ? players.find((p) => p.id === saved.id) : null;
  return byId?.id ?? pickPlayerByName(players, saved.name);
}

/**
 * その選手の、トーナメント・総当たりごとの「次の試合」と成績。表にいない選手は、その種類を含めない。
 * state: 'next'（次に行う試合がある）／'waiting'（勝ち残っているが、対戦者か順番が未定）／'finished'（全試合が終わった・敗退した）
 * @returns {{kind:'tournament'|'league', state:'next'|'waiting'|'finished', label:string, no:number|null, table:string,
 *   timeSlot:number, opponent:string, record:string, standing:string, nowRound:boolean}[]}
 */
export function playerSummaries(st, playerId) {
  const out = [];
  if (st.tournament?.playerIds.includes(playerId)) out.push(tournamentSummary(st, playerId));
  if (st.league?.playerIds.includes(playerId)) out.push(leagueSummary(st, playerId));
  return out;
}

function matchInfo(st, m, label, opponentId) {
  return {
    label,
    no: m.no ?? null,
    table: m.tableId ? tableName(st, m.tableId) : '',
    timeSlot: m.timeSlot || 1,
    opponent: opponentId === undefined || opponentId === null ? '' : playerName(st, opponentId),
  };
}

function tournamentSummary(st, id) {
  const res = resolveBracket(st.tournament, st.tables);
  const R = res.roundCount;
  const mine = res.matches.filter((m) => m.playable && (m.p1 === id || m.p2 === id)).sort((a, b) => a.no - b.no);
  const labelOf = (m) => (m.isThirdPlace ? '3位決定戦' : roundName(m.round, R));
  const info = tournamentRanking(st.tournament, res).find((r) => r.playerId === id);
  const record = info ? `${info.wins}勝${info.losses}敗` : '';
  const base = { kind: 'tournament', record, standing: '', nowRound: true };
  const ready = mine.find((m) => m.status === 'ready');
  if (ready) return { ...base, state: 'next', ...matchInfo(st, ready, labelOf(ready), ready.p1 === id ? ready.p2 : ready.p1) };
  // 勝ち残っているが、対戦者が決まっていない試合（前の試合の結果待ち）
  const waiting = mine.find((m) => m.status === 'waiting');
  if (waiting) return { ...base, state: 'waiting', ...matchInfo(st, waiting, labelOf(waiting), null), no: null, table: '', timeSlot: 1 };
  return { ...base, state: 'finished', standing: info?.label ?? '', ...matchInfo(st, {}, '', null), no: null };
}

function leagueSummary(st, id) {
  const res = resolveLeague(st.league, st.tables);
  const row = leagueStandings(st.league, st.settings.league).find((r) => r.playerId === id);
  const draws = row && row.draw > 0 ? `${row.draw}分` : '';
  const record = row ? `${row.win}勝${draws}${row.loss}敗` : '';
  const pending = res.matches.filter((m) => m.status !== 'done');
  const currentRound = pending.length ? Math.min(...pending.map((m) => m.round)) : null;
  const mine = pending.filter((m) => m.p1 === id || m.p2 === id).sort((a, b) => a.no - b.no)[0];
  const base = { kind: 'league', record, nowRound: !mine || mine.round === currentRound };
  if (mine) return { ...base, state: 'next', standing: '', ...matchInfo(st, mine, `${mine.round}回戦`, mine.p1 === id ? mine.p2 : mine.p1) };
  return { ...base, state: 'finished', standing: row ? `${row.rank}位` : '', ...matchInfo(st, {}, '', null), no: null };
}
