// 総当たり（リーグ戦）の生成・結果・順位

import { normalizeResultInput, assignTable } from './result.js';

export const MIN_LEAGUE_PLAYERS = 2;
export const MAX_LEAGUE_PLAYERS = 40;
export const DEFAULT_POINTS = { win: 3, draw: 1, loss: 0 };

/**
 * サークル方式で日程を作る。各回戦で全員が最大1試合。奇数人数なら各回戦1人が休み。
 */
export function generateLeague(playerIds) {
  const n = playerIds.length;
  if (n < MIN_LEAGUE_PLAYERS) throw new Error(`総当たりには${MIN_LEAGUE_PLAYERS}人以上必要です`);
  if (n > MAX_LEAGUE_PLAYERS) throw new Error(`総当たりは${MAX_LEAGUE_PLAYERS}人までです`);
  let arr = n % 2 ? [...playerIds, null] : [...playerIds];
  const m = arr.length;
  const matches = [];
  for (let r = 0; r < m - 1; r++) {
    for (let i = 0; i < m / 2; i++) {
      let a = arr[i];
      let b = arr[m - 1 - i];
      if (a === null || b === null) continue;
      // 固定位置の選手がいつも左にならないよう、回戦ごとに入れ替える
      if (i === 0 && r % 2 === 1) [a, b] = [b, a];
      matches.push({ id: `L${matches.length + 1}`, round: r + 1, p1: a, p2: b });
    }
    arr = [arr[0], arr[m - 1], ...arr.slice(1, m - 1)];
  }
  return { playerIds: [...playerIds], matches, results: {}, tableOverrides: {} };
}

export function leagueRoundCount(league) {
  return league.matches.reduce((mx, m) => Math.max(mx, m.round), 0);
}

/** 各試合に状態・試合番号・卓・時間帯を付けて返す */
export function resolveLeague(league, tables = []) {
  const perRound = new Map();
  let no = 0;
  const matches = league.matches.map((m) => {
    const seq = perRound.get(m.round) ?? 0;
    perRound.set(m.round, seq + 1);
    const r = league.results[m.id];
    const result = r && ['p1', 'p2', 'draw'].includes(r.outcome) ? r : null;
    return { ...m, no: ++no, result, status: result ? 'done' : 'ready',
      ...assignTable(seq, tables, league.tableOverrides?.[m.id]) };
  });
  const rounds = leagueRoundCount(league);
  const rest = [];
  for (let r = 1; r <= rounds; r++) {
    const playing = new Set(matches.filter((m) => m.round === r).flatMap((m) => [m.p1, m.p2]));
    rest.push(league.playerIds.filter((id) => !playing.has(id)));
  }
  return { matches, roundCount: rounds, rest };
}

export function setLeagueResult(league, id, input, { allowDraw = true } = {}) {
  const m = league.matches.find((x) => x.id === id);
  if (!m) return { ok: false, error: '試合が見つかりません' };
  const results = { ...league.results };
  if (input === null) {
    delete results[id];
  } else {
    const v = normalizeResultInput(input, { allowDraw });
    if (!v.ok) return v;
    results[id] = v.value;
  }
  return { ok: true, league: { ...league, results } };
}

export function setLeagueTable(league, id, tableId) {
  const tableOverrides = { ...(league.tableOverrides || {}) };
  if (tableId) tableOverrides[id] = tableId;
  else delete tableOverrides[id];
  return { ...league, tableOverrides };
}

/** 選手 id から見た試合結果。'win' | 'loss' | 'draw' | null */
export function outcomeFor(match, result, id) {
  if (!result) return null;
  if (result.outcome === 'draw') return 'draw';
  const winner = result.outcome === 'p1' ? match.p1 : match.p2;
  return winner === id ? 'win' : 'loss';
}

function emptyRow(id) {
  return { playerId: id, played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0, diff: 0, points: 0, h2h: 0, rank: null };
}

function tally(row, outcome, gf, ga, points) {
  row.played++;
  row[outcome]++;
  row.points += points[outcome];
  if (gf !== null && gf !== undefined) {
    row.gf += gf;
    row.ga += ga;
    row.diff = row.gf - row.ga;
  }
}

/**
 * 順位表。並び順: 勝点 → 同勝点内の直接対決の勝点 → 得失点差 → 総得点。すべて同じなら同順位。
 * 不戦勝は勝ちとして数え、スコアは得失点に含めない。
 */
export function leagueStandings(league, points = DEFAULT_POINTS) {
  const rows = new Map(league.playerIds.map((id) => [id, emptyRow(id)]));
  const done = [];
  for (const m of league.matches) {
    const r = league.results[m.id];
    if (!r || !rows.has(m.p1) || !rows.has(m.p2)) continue;
    done.push([m, r]);
    const o1 = outcomeFor(m, r, m.p1);
    const o2 = outcomeFor(m, r, m.p2);
    tally(rows.get(m.p1), o1, r.walkover ? null : r.score1, r.walkover ? null : r.score2, points);
    tally(rows.get(m.p2), o2, r.walkover ? null : r.score2, r.walkover ? null : r.score1, points);
  }
  // 直接対決（同勝点の選手同士の試合のみ）
  for (const [m, r] of done) {
    const a = rows.get(m.p1);
    const b = rows.get(m.p2);
    if (a.points !== b.points) continue;
    a.h2h += points[outcomeFor(m, r, m.p1)];
    b.h2h += points[outcomeFor(m, r, m.p2)];
  }
  const order = new Map(league.playerIds.map((id, i) => [id, i]));
  const keys = ['points', 'h2h', 'diff', 'gf'];
  const list = [...rows.values()].sort((x, y) => {
    for (const k of keys) if (x[k] !== y[k]) return y[k] - x[k];
    return order.get(x.playerId) - order.get(y.playerId);
  });
  list.forEach((row, i) => {
    const prev = list[i - 1];
    row.rank = prev && keys.every((k) => prev[k] === row[k]) ? prev.rank : i + 1;
  });
  return list;
}

export function leagueProgress(resolved) {
  const total = resolved.matches.length;
  const done = resolved.matches.filter((m) => m.status === 'done').length;
  // 次に行う試合: 結果未入力の試合のうち、最も早い回戦のもの
  const pending = resolved.matches.filter((m) => m.status !== 'done');
  const nextRound = pending.length ? Math.min(...pending.map((m) => m.round)) : null;
  return { total, done, nextRound, ready: pending.filter((m) => m.round === nextRound) };
}
