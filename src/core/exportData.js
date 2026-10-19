// 出力用の表データ（CSV と PNG で共用）。すべて { title, headers, rows } を返す

import { resolveBracket, roundName, tournamentRanking } from './bracket.js';
import { resolveLeague, leagueStandings, outcomeFor } from './league.js';
import { formatScore } from './result.js';
import { playerName, tableName } from './state.js';
import { eventTitle } from './edition.js';

// running は画面のバッジだけ（試合の状態は ready のまま、開始時刻があるものを「進行中」と呼ぶ）。CSV・PNG の「状態」は ready のとき「試合待ち」のまま
export const STATUS = { done: '終了', ready: '試合待ち', running: '進行中', waiting: '対戦者未定', bye: '不戦', empty: '－' };

function titleOf(state, kind) {
  return `${eventTitle(state)} ${kind}`;
}

function sideScore(m, side) {
  const r = m.result;
  if (!r || r.walkover || r.score1 === null) return '';
  return String(side === 'p1' ? r.score1 : r.score2);
}

/** トーナメント表（行=1回戦の枠、列=各回戦の出場者） */
export function bracketTable(state) {
  const t = state.tournament;
  const res = resolveBracket(t, state.tables);
  const R = res.roundCount;
  const headers = [...res.rounds.map((_, k) => roundName(k + 1, R)), '優勝'];
  const rows = [];
  for (let i = 0; i < t.size; i++) {
    const row = [];
    for (let k = 0; k < R; k++) {
      const block = 2 ** k;
      if (i % block !== 0) { row.push(''); continue; }
      const j = i / block;
      const m = res.rounds[k][Math.floor(j / 2)];
      const side = j % 2 === 0 ? 'p1' : 'p2';
      const id = m[side];
      if (k > 0 && id === null) { row.push(''); continue; }
      const sc = sideScore(m, side);
      const mark = m.status === 'done' && m.winner === id ? '○' : '';
      row.push(id === undefined ? '' : `${mark}${playerName(state, id)}${sc ? ` (${sc})` : ''}`);
    }
    row.push(i === 0 && res.champion ? playerName(state, res.champion) : '');
    rows.push(row);
  }
  if (res.thirdPlace) {
    const tp = res.thirdPlace;
    rows.push(Array(R + 1).fill(''));
    const name = (side) => (tp[side] === undefined ? '（未定）' : playerName(state, tp[side]));
    const winner = tp.winner ? `3位: ${playerName(state, tp.winner)}` : '';
    const vs = `${name('p1')} vs ${name('p2')}`;
    const score = formatScore(tp.result);
    // 見出しの列数（回戦数+1）に合わせる。4人以下は列が3つなので、スコアを対戦者の欄にまとめる
    const cells = R + 1 >= 4 ? ['3位決定戦', vs, score, winner] : ['3位決定戦', score ? `${vs} (${score})` : vs, winner];
    rows.push([...cells, ...Array(R + 1 - cells.length).fill('')]);
  }
  return { title: titleOf(state, 'トーナメント表'), headers, rows };
}

/** トーナメントの試合結果一覧（表示用の生データも返す） */
export function tournamentResultRows(state) {
  const res = resolveBracket(state.tournament, state.tables);
  const R = res.roundCount;
  const list = [];
  for (const m of res.matches) {
    if (m.status === 'empty') continue;
    list.push({
      match: m,
      cells: [
        m.no ?? '',
        m.isThirdPlace ? '3位決定戦' : roundName(m.round, R),
        m.tableId ? tableName(state, m.tableId) : '',
        m.timeSlot ?? '',
        m.p1 === undefined ? '（未定）' : playerName(state, m.p1),
        formatScore(m.result),
        m.p2 === undefined ? '（未定）' : playerName(state, m.p2),
        m.status === 'done' || m.status === 'bye' ? playerName(state, m.winner) : '',
        STATUS[m.status],
      ],
    });
  }
  // 試合番号順（不戦は各回戦の最後）
  list.sort((a, b) => (a.match.round - b.match.round) ||
    ((a.match.no ?? Infinity) - (b.match.no ?? Infinity)) || (a.match.index - b.match.index));
  return list;
}

export function tournamentResultsTable(state) {
  return {
    title: titleOf(state, 'トーナメント 試合結果'),
    headers: ['試合番号', '回戦', '卓', '時間帯', '選手1', 'スコア', '選手2', '勝者', '状態'],
    rows: tournamentResultRows(state).map((r) => r.cells),
  };
}

/** 順位表の行（画面用）。ranking は tournamentRanking の1行（phase・medal を持つ）、cells は表の1行 */
export function tournamentStandingsRows(state) {
  return tournamentRanking(state.tournament).map((r) => ({
    ranking: r,
    cells: [r.rank ?? '', playerName(state, r.playerId), r.label, r.wins, r.losses],
  }));
}

export function tournamentStandingsTable(state) {
  const rows = tournamentStandingsRows(state);
  return {
    title: titleOf(state, 'トーナメント 順位表'),
    headers: ['順位', '名前', '成績', '勝', '敗'],
    rows: rows.map((r) => r.cells),
    rowMedals: rows.map((r) => r.ranking.medal), // 大会が終わったときの1〜3位の印（PNG の帯に使う。CSV には出さない）
  };
}

export function matrixCell(m, result, id) {
  if (!m) return '';
  const o = outcomeFor(m, result, id);
  if (!o) return '';
  const mark = { win: '○', loss: '×', draw: '△' }[o];
  if (result.walkover) return o === 'win' ? `${mark} 不戦勝` : `${mark} 不戦敗`;
  if (result.score1 === null) return mark;
  const mine = id === m.p1 ? result.score1 : result.score2;
  const theirs = id === m.p1 ? result.score2 : result.score1;
  return `${mark} ${mine}-${theirs}`;
}

/** 総当たり表（対戦マトリクス） */
export function leagueMatrixTable(state) {
  const l = state.league;
  const pairs = new Map(l.matches.map((m) => [`${m.p1}|${m.p2}`, m]).concat(l.matches.map((m) => [`${m.p2}|${m.p1}`, m])));
  const standings = new Map(leagueStandings(l, state.settings.league).map((s) => [s.playerId, s]));
  const names = l.playerIds.map((id) => playerName(state, id));
  const headers = ['', ...names, '勝', '分', '敗', '勝点', '順位'];
  const rows = l.playerIds.map((id, i) => {
    const s = standings.get(id);
    return [
      names[i],
      ...l.playerIds.map((op) => {
        if (op === id) return '－';
        const m = pairs.get(`${id}|${op}`);
        return matrixCell(m, m && l.results[m.id], id);
      }),
      s.win, s.draw, s.loss, s.points, s.rank,
    ];
  });
  return { title: titleOf(state, '総当たり表'), headers, rows };
}

export function leagueResultRows(state) {
  const res = resolveLeague(state.league, state.tables);
  return res.matches.map((m) => {
    const r = m.result;
    let verdict = '';
    if (r) verdict = r.outcome === 'draw' ? '引き分け' : `${playerName(state, r.outcome === 'p1' ? m.p1 : m.p2)}の勝ち`;
    return {
      match: m,
      cells: [m.no, `${m.round}回戦`, m.tableId ? tableName(state, m.tableId) : '', m.timeSlot ?? '',
        playerName(state, m.p1), formatScore(r), playerName(state, m.p2), verdict, STATUS[m.status]],
    };
  });
}

export function leagueResultsTable(state) {
  return {
    title: titleOf(state, '総当たり 試合結果'),
    headers: ['試合番号', '回戦', '卓', '時間帯', '選手1', 'スコア', '選手2', '結果', '状態'],
    rows: leagueResultRows(state).map((r) => r.cells),
  };
}

export function leagueStandingsTable(state) {
  const rows = leagueStandings(state.league, state.settings.league).map((s) => [
    s.rank, playerName(state, s.playerId), s.played, s.win, s.draw, s.loss, s.gf, s.ga, s.diff, s.points,
  ]);
  return {
    title: titleOf(state, '総当たり 順位表'),
    headers: ['順位', '名前', '試合', '勝', '分', '敗', '得点', '失点', '得失点差', '勝点'],
    rows,
    note: `勝点 勝${state.settings.league.win}・分${state.settings.league.draw}・敗${state.settings.league.loss}／同勝点は 直接対決→得失点差→総得点 の順`,
  };
}

/** {headers, rows} を CSV 用の2次元配列にする */
export function tableToRows({ headers, rows }) {
  return [headers, ...rows];
}
