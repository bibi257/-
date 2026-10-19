// 閲覧者からの試合結果の報告（共有）。報告は運営が承認したときだけ表に反映する。DOM に依存しない

import { resolveBracket, roundName, setTournamentResult } from './bracket.js';
import { resolveLeague, setLeagueResult } from './league.js';
import { settleWalkovers } from './attendance.js';
import { normalizeResultInput } from './result.js';
import { playerName } from './state.js';

const nameOf = (st, id) => (id === undefined || id === null ? '（未定）' : playerName(st, id) || '（未定）');

/** 結果を報告できる試合（対戦者が決まっていて、結果がまだ無い試合）。ラベルは共有のコメントの対象と同じ形 */
export function reportTargets(st) {
  const out = [];
  if (st.tournament) {
    const res = resolveBracket(st.tournament, st.tables);
    for (const m of res.playable) {
      if (m.status !== 'ready') continue;
      const round = m.isThirdPlace ? '3位決定戦' : roundName(m.round, res.roundCount);
      out.push({ id: m.id, kind: 'tournament', group: 'トーナメント', p1: m.p1, p2: m.p2, p1Name: nameOf(st, m.p1), p2Name: nameOf(st, m.p2), allowDraw: false,
        label: `${round} No.${m.no}　${nameOf(st, m.p1)} vs ${nameOf(st, m.p2)}` });
    }
  }
  if (st.league) {
    const res = resolveLeague(st.league, st.tables);
    const allowDraw = !!st.settings?.league?.allowDraw;
    for (const m of res.matches) {
      if (m.result) continue;
      out.push({ id: m.id, kind: 'league', group: '総当たり', p1: m.p1, p2: m.p2, p1Name: nameOf(st, m.p1), p2Name: nameOf(st, m.p2), allowDraw,
        label: `${m.round}回戦 No.${m.no}　${nameOf(st, m.p1)} vs ${nameOf(st, m.p2)}` });
    }
  }
  return out;
}

/**
 * 送る報告を検査して整える。
 * @param {{matchId:string, outcome?:string, score1?:any, score2?:any}} input
 * @returns {{ok:true, report:{matchId:string, outcome:string, score1:number|null, score2:number|null, p1:string, p2:string}} | {ok:false, error:string}}
 */
export function checkReport(st, input) {
  const target = reportTargets(st).find((t) => t.id === input.matchId);
  if (!target) return { ok: false, error: '報告する試合を選んでください（結果が入っていない試合だけ選べます）' };
  const v = normalizeResultInput({ outcome: input.outcome, score1: input.score1, score2: input.score2 }, { allowDraw: target.allowDraw });
  if (!v.ok) return v;
  const { outcome, score1, score2 } = v.value;
  return { ok: true, report: { matchId: target.id, outcome, score1, score2, p1: target.p1, p2: target.p2 } };
}

/** 報告の見た目の説明（「山田 3 - 1 佐藤　山田の勝ち」）。勝者・スコアは、報告した時点の p1/p2 の順 */
export function reportText(st, report) {
  const a = nameOf(st, report.p1);
  const b = nameOf(st, report.p2);
  const score = report.score1 !== null && report.score1 !== undefined ? `${report.score1} - ${report.score2}` : null;
  const verdict = report.outcome === 'draw' ? '引き分け' : `${report.outcome === 'p1' ? a : b}の勝ち`;
  return `${a} ${score ?? 'vs'} ${b}　${verdict}`;
}

/** 報告の対象の試合を探す。見つからない・結果が入った・対戦者が変わったときは、承認できない理由を返す */
function findOpenMatch(st, report) {
  const hit = reportTargets(st).find((t) => t.id === report.matchId);
  if (hit) {
    if (hit.p1 !== report.p1 || hit.p2 !== report.p2) return { error: '試合の対戦者が変わったため、承認できません' };
    return { target: hit };
  }
  const exists = (st.tournament && resolveBracket(st.tournament, st.tables).matches.some((m) => m.id === report.matchId)) ||
    (st.league && st.league.matches.some((m) => m.id === report.matchId));
  return { error: exists ? 'この試合はすでに結果が入っているため、承認できません' : 'その試合は表にありません' };
}

/** 報告を承認できるか（できないときの理由つき） */
export function reportStatus(st, report) {
  const r = findOpenMatch(st, report);
  return r.error ? { ok: false, error: r.error } : { ok: true };
}

/**
 * 報告を表に反映する（承認）。運営が結果を入力したときと同じ関数を通す。
 * @returns {{ok:true, state:object, settled:number} | {ok:false, error:string}}
 *   settled: 続けて不戦にした試合の数（欠席の人の試合）
 */
export function applyReport(st, report) {
  const found = findOpenMatch(st, report);
  if (found.error) return { ok: false, error: found.error };
  const input = { outcome: report.outcome, score1: report.score1, score2: report.score2 };
  if (found.target.kind === 'tournament') {
    const out = setTournamentResult(st.tournament, report.matchId, input);
    if (!out.ok) return out;
    const settled = settleWalkovers(out.tournament);
    return { ok: true, state: { ...st, tournament: settled.tournament }, settled: settled.count };
  }
  const out = setLeagueResult(st.league, report.matchId, input, { allowDraw: !!st.settings?.league?.allowDraw });
  if (!out.ok) return out;
  return { ok: true, state: { ...st, league: out.league }, settled: 0 };
}
