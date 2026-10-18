// 呼び出し画面（会場の大型表示）に出す内容。次に行う試合を、卓・時間帯・対戦者つきでまとめる。

import { resolveBracket, tournamentProgress, roundName } from './bracket.js';
import { resolveLeague, leagueProgress } from './league.js';
import { eventTitle } from './edition.js';
import { playerName, tableName } from './state.js';

/**
 * @param {object} st 大会データ
 * @param {'tournament'|'league'} kind
 * @returns {{kind:'none'|'tournament'|'league', title:string, done:number, total:number, finished:boolean,
 *   champion:string, rest:string[], items:{id:string,no:number,label:string,table:string,timeSlot:number,p1:string,p2:string}[]}}
 */
export function callBoard(st, kind) {
  const base = { title: eventTitle(st), done: 0, total: 0, finished: false, champion: '', rest: [], items: [] };
  const item = (m, label) => ({
    id: m.id,
    no: m.no,
    label,
    table: m.tableId ? tableName(st, m.tableId) : '',
    timeSlot: m.timeSlot || 1,
    p1: playerName(st, m.p1),
    p2: playerName(st, m.p2),
  });

  if (kind === 'tournament' && st.tournament) {
    const res = resolveBracket(st.tournament, st.tables);
    const prog = tournamentProgress(res);
    const items = [...prog.ready].sort((a, b) => a.no - b.no)
      .map((m) => item(m, m.isThirdPlace ? '3位決定戦' : roundName(m.round, res.roundCount)));
    return {
      ...base,
      kind,
      done: prog.done,
      total: prog.total,
      finished: !!res.finished,
      champion: res.champion ? playerName(st, res.champion) : '',
      items,
    };
  }

  if (kind === 'league' && st.league) {
    const res = resolveLeague(st.league, st.tables);
    const prog = leagueProgress(res);
    const items = [...prog.ready].sort((a, b) => a.no - b.no).map((m) => item(m, `${m.round}回戦`));
    return {
      ...base,
      kind,
      done: prog.done,
      total: prog.total,
      finished: prog.total > 0 && prog.done === prog.total,
      rest: prog.nextRound ? res.rest[prog.nextRound - 1].map((id) => playerName(st, id)) : [],
      items,
    };
  }

  return { ...base, kind: 'none' };
}
