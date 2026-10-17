// 回（第1回・第2回…）の管理。同じ参加者・卓・設定のまま次の回を始め、前の回は「過去の回」として残す。
// 過去の回は読み取り専用の記録（その時点の名簿・卓・設定・表・結果の写し）で、後から名簿を変えても書き換わらない。

import { resolveBracket, tournamentProgress } from './bracket.js';
import { resolveLeague, leagueProgress, leagueStandings } from './league.js';

export const MAX_HISTORY = 20;
/** 共有サーバーに送れる大会データの上限（1,000,000 文字）に収めるための目安 */
export const SHARE_LIMIT_CHARS = 900000;

export function currentEdition(state) {
  const h = state.history ?? [];
  return h.reduce((m, e) => Math.max(m, e.edition), 0) + 1;
}

/** 画面・出力ファイルに使う大会名。過去の回がある（＝2回目以降を扱っている）ときだけ「第N回」を付ける */
export function eventTitle(state) {
  const base = state.meta.title || '大会';
  if (!state.history?.length) return base;
  return `${base} 第${state.viewEdition ?? currentEdition(state)}回`;
}

function archiveOf(state) {
  return structuredClone({
    edition: currentEdition(state),
    date: state.meta.date ?? '',
    archivedAt: new Date().toISOString(),
    players: state.players,
    tables: state.tables,
    settings: state.settings,
    tournament: state.tournament,
    league: state.league,
  });
}

/** 今の回を過去の回へ移し、参加者・卓・設定を引き継いだ新しい回を始める */
export function startNextEdition(state) {
  if (!state.tournament && !state.league) {
    return { ok: false, error: '今の回にはまだ表がありません。表を作って試合を行ってから、次の回を始めてください' };
  }
  if ((state.history?.length ?? 0) >= MAX_HISTORY) {
    return { ok: false, error: `過去の回は${MAX_HISTORY}回分までです。古い回を削除してから始めてください` };
  }
  return {
    ok: true,
    state: {
      ...state,
      meta: { ...state.meta, date: '' },
      history: [...(state.history ?? []), archiveOf(state)],
      tournament: null,
      league: null,
    },
  };
}

export function deleteEdition(state, edition) {
  return { ...state, history: (state.history ?? []).filter((e) => e.edition !== edition) };
}

/** 過去の回を、既存の画面・出力がそのまま使える大会データの形にする（保存はしない読み取り専用の表示用） */
export function editionState(state, edition) {
  const e = (state.history ?? []).find((x) => x.edition === edition);
  if (!e) return null;
  return {
    ...state,
    meta: { ...state.meta, date: e.date },
    players: e.players,
    tables: e.tables,
    settings: e.settings,
    tournament: e.tournament,
    league: e.league,
    viewEdition: edition,
  };
}

/** 過去の回の一覧に出す、結果の概要 */
export function editionSummary(entry) {
  const name = (id) => entry.players.find((p) => p.id === id)?.name ?? '（削除された参加者）';
  const parts = [];
  if (entry.tournament) {
    const res = resolveBracket(entry.tournament, entry.tables);
    const p = tournamentProgress(res);
    parts.push(res.champion ? `トーナメント 優勝 ${name(res.champion)}` : `トーナメント 途中（${p.done}/${p.total}試合）`);
  }
  if (entry.league) {
    const res = resolveLeague(entry.league, entry.tables);
    const p = leagueProgress(res);
    if (p.done === p.total) {
      const top = leagueStandings(entry.league, entry.settings.league).filter((r) => r.rank === 1).map((r) => name(r.playerId));
      parts.push(`総当たり 1位 ${top.join('・')}`);
    } else {
      parts.push(`総当たり 途中（${p.done}/${p.total}試合）`);
    }
  }
  return parts.join('　') || '表なし';
}

/** 共有サーバーへ送る大会データ。大きすぎるときは、古い回から順に過去の回を外す（この端末のデータは変えない） */
export function fitForShare(state, limit = SHARE_LIMIT_CHARS) {
  let st = state;
  while (st.history?.length && JSON.stringify(st).length > limit) {
    st = { ...st, history: st.history.slice(1) };
  }
  return st;
}
