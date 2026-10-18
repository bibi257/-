// 当日の出欠。名簿の `absent: true` が欠席（無ければ出席）。表の作成・作成後の欠席の反映に使う。

import { resolveBracket, setTournamentResult } from './bracket.js';
import { setLeagueResult } from './league.js';

export const isAbsent = (p) => p.absent === true;

/** 出席・欠席の人数 */
export function attendanceCount(players) {
  const absent = players.filter(isAbsent).length;
  return { total: players.length, present: players.length - absent, absent };
}

export const presentPlayers = (players) => players.filter((p) => !isAbsent(p));

/** 1人の出欠を変える。欠席でない選手は `absent` を持たない（古い形式と同じ形に保つ） */
export function setAbsent(players, id, absent) {
  return players.map((p) => {
    if (p.id !== id) return p;
    const { absent: _drop, ...rest } = p;
    return absent ? { ...rest, absent: true } : rest;
  });
}

/** 全員を出席にする */
export function allPresent(players) {
  return players.map(({ absent: _drop, ...rest }) => rest);
}

/** そのトーナメントで、選手がまだ勝ち上がる可能性がある（敗退も優勝決定も済んでいない）か */
function stillInTournament(res, id) {
  if (res.finished) return false;
  const lost = res.matches.some((m) => m.status === 'done' && m.loser === id);
  if (!lost) return true;
  const tp = res.thirdPlace; // 準決勝で負けても、3位決定戦が残っていればまだ出る
  return !!tp && tp.status !== 'done' && (tp.p1 === id || tp.p2 === id);
}

/**
 * 選手を欠席にしたときに、作成済みの表へ及ぶ影響。
 * now: いま対戦者が決まっていて結果が無い試合の数（トーナメントと総当たりの合計）。
 * later: トーナメントで、勝ち上がれば後で出る試合がある（不戦勝で上がった枠・まだ対戦者が決まらない試合）。
 * 表にいない・もう出る試合がない選手は、どちらも 0・false。
 */
export function absenceImpact(st, playerId) {
  let now = 0;
  let later = false;
  if (st.tournament?.playerIds.includes(playerId)) {
    const res = resolveBracket(st.tournament);
    const ready = res.matches.filter((m) => m.status === 'ready' && (m.p1 === playerId || m.p2 === playerId)).length;
    now += ready;
    later = stillInTournament(res, playerId) && !ready;
  }
  if (st.league?.playerIds.includes(playerId)) {
    now += st.league.matches.filter((m) => !st.league.results[m.id] && (m.p1 === playerId || m.p2 === playerId)).length;
  }
  return { now, later };
}

function walkoverInput(m, absentIds) {
  // 片方だけ欠席ならもう片方の不戦勝。両方欠席のときは便宜上、上の枠（p1）の不戦勝にする（結果入力で変えられる）
  return { walkover: true, outcome: absentIds.has(m.p1) && !absentIds.has(m.p2) ? 'p2' : 'p1' };
}

/**
 * トーナメントで、欠席者が出る試合を不戦（相手の不戦勝）にする。勝ち上がった先で当たる試合も、欠席者が出なくなるまで続ける。
 * 不戦にした選手は `walkoverIds` に残す（あとで結果が入って、その選手の次の試合が決まったときも不戦にするため。`settleWalkovers`）。
 * @returns {{tournament:object, count:number}}
 */
export function applyTournamentWalkovers(tournament, absentIds) {
  const inTable = new Set(tournament.playerIds);
  const marked = [...new Set([...(tournament.walkoverIds ?? []), ...[...absentIds].filter((id) => inTable.has(id))])];
  let t = marked.length ? { ...tournament, walkoverIds: marked } : tournament;
  let count = 0;
  for (;;) {
    const m = resolveBracket(t).matches.find((x) => x.status === 'ready' && (absentIds.has(x.p1) || absentIds.has(x.p2)));
    if (!m) return { tournament: t, count };
    const r = setTournamentResult(t, m.id, walkoverInput(m, absentIds));
    if (!r.ok) return { tournament: t, count };
    t = r.tournament;
    count++;
  }
}

/** 不戦にすると決めた選手（`walkoverIds`）の試合が新しく決まっていれば、不戦にする（結果を保存したあとに使う） */
export function settleWalkovers(tournament) {
  if (!tournament.walkoverIds?.length) return { tournament, count: 0 };
  return applyTournamentWalkovers(tournament, new Set(tournament.walkoverIds));
}

/** 出席に戻した選手を、不戦にする選手から外す（すでに入った不戦の結果は変えない） */
export function stopWalkover(tournament, playerId) {
  if (!tournament?.walkoverIds?.includes(playerId)) return tournament;
  const { walkoverIds, ...rest } = tournament;
  const left = walkoverIds.filter((id) => id !== playerId);
  return left.length ? { ...rest, walkoverIds: left } : rest;
}

/**
 * 総当たりで、欠席者が出る未実施の試合を不戦（相手の不戦勝）にする。
 * @returns {{league:object, count:number}}
 */
export function applyLeagueWalkovers(league, absentIds) {
  let l = league;
  let count = 0;
  for (const m of league.matches) {
    if (l.results[m.id] || !(absentIds.has(m.p1) || absentIds.has(m.p2))) continue;
    const r = setLeagueResult(l, m.id, walkoverInput(m, absentIds));
    if (!r.ok) continue;
    l = r.league;
    count++;
  }
  return { league: l, count };
}

/**
 * 欠席の選手が出る未実施の試合を、トーナメント・総当たりの両方で不戦にする。
 * @returns {{state:object, count:number}}
 */
export function applyWalkovers(st, absentIds) {
  const ids = new Set(absentIds);
  let { tournament, league } = st;
  let count = 0;
  if (tournament) {
    const r = applyTournamentWalkovers(tournament, ids);
    tournament = r.tournament;
    count += r.count;
  }
  if (league) {
    const r = applyLeagueWalkovers(league, ids);
    league = r.league;
    count += r.count;
  }
  return { state: { ...st, tournament, league }, count };
}
