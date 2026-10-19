// トーナメント（シングルイリミネーション）の生成・結果反映・順位
//
// 保存するのは「1回戦の並び（slots）」と「各試合の結果」だけで、
// 2回戦以降の対戦者・勝者は resolveBracket で毎回導出する。
// 導出値の表現: 選手ID = 確定, null = 誰も来ない（不戦）, undefined = 未定（前の試合待ち）

import { normalizeResultInput, assignTable } from './result.js';
import { isStartTime, applyStarted } from './started.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 128;

export function bracketSize(n) {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

/** 標準シード順。位置 i に入るシード順位（1始まり）の配列。例: 8 → [1,8,4,5,2,7,3,6] */
export function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const len = order.length * 2;
    order = order.flatMap((s) => [s, len + 1 - s]);
  }
  return order;
}

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function roundName(round, roundCount) {
  if (round === roundCount) return '決勝';
  if (round === roundCount - 1) return '準決勝';
  if (round === roundCount - 2) return '準々決勝';
  return `${round}回戦`;
}

/**
 * トーナメントを生成する。
 * playerIds の並び順がシード順。先頭 seedCount 人がシード。
 * シード外は placement が 'random' なら抽選、'order' なら名簿順で順位付けし、
 * 標準シード順の位置に配置する。不戦（bye）は順位の高い選手から割り当てられる。
 * slots を渡すと、1回戦の配置をその指定どおりにする（組み合わせの確認画面で選手を入れ替えたとき）。
 * 渡す配置は、全員がちょうど1回ずつ入り、残りが不戦（null）で、不戦どうしの組がないこと。正しくなければ例外にする。
 */
export function generateTournament(playerIds, { seedCount = 0, placement = 'order', thirdPlace = false, slots: given = null } = {}, rng = Math.random) {
  const n = playerIds.length;
  if (n < MIN_PLAYERS) throw new Error(`トーナメントには${MIN_PLAYERS}人以上必要です`);
  if (n > MAX_PLAYERS) throw new Error(`トーナメントは${MAX_PLAYERS}人までです`);
  const seeds = Math.max(0, Math.min(seedCount | 0, n));
  const size = bracketSize(n);
  const head = playerIds.slice(0, seeds);
  const rest = placement === 'random' ? shuffle(playerIds.slice(seeds), rng) : playerIds.slice(seeds);
  const ranked = [...head, ...rest];
  const slots = given ? checkSlots(given, playerIds, size) : seedOrder(size).map((rank) => (rank <= n ? ranked[rank - 1] : null));
  return {
    size,
    slots,
    seedCount: seeds,
    placement,
    thirdPlace: !!thirdPlace && size >= 4,
    playerIds: [...playerIds],
    results: {},
    tableOverrides: {},
    started: {},
  };
}

/** 指定された1回戦の配置を検査して返す（全員が1回ずつ・残りは不戦・不戦どうしの組なし） */
function checkSlots(slots, playerIds, size) {
  const ok = Array.isArray(slots) && slots.length === size
    && slots.filter((s) => s !== null).length === playerIds.length
    && new Set(slots.filter((s) => s !== null)).size === playerIds.length
    && slots.every((s) => s === null || playerIds.includes(s));
  if (!ok) throw new Error('組み合わせが正しくありません');
  for (let i = 0; i < size; i += 2) if (slots[i] === null && slots[i + 1] === null) throw new Error('組み合わせが正しくありません（不戦どうしの試合ができます）');
  return [...slots];
}

/** 1回戦の配置で、2人の選手の位置を入れ替える（新しい配置を返す。選手でない位置・同じ位置は例外） */
export function swapSlots(slots, a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || !slots[a] || !slots[b]) throw new Error('入れ替える選手を2人選んでください');
  const out = [...slots];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

export function matchId(round, index) {
  return `R${round}-M${index + 1}`;
}
export const THIRD_PLACE_ID = '3P';

function decide(m, result) {
  const { p1, p2 } = m;
  if (p1 === undefined || p2 === undefined) {
    m.status = 'waiting';
  } else if (p1 === null && p2 === null) {
    m.status = 'empty';
    m.winner = null;
    m.loser = null;
  } else if (p1 === null || p2 === null) {
    m.status = 'bye';
    m.winner = p1 === null ? p2 : p1;
    m.loser = null;
  } else {
    m.status = 'ready';
  }
  if (!result) return false;
  // 結果は入力時の対戦者と一致するときだけ有効
  const valid = m.status === 'ready' && result.p1 === p1 && result.p2 === p2 &&
    (result.winnerId === p1 || result.winnerId === p2);
  if (!valid) return true; // stale
  m.status = 'done';
  m.result = result;
  m.winner = result.winnerId;
  m.loser = result.winnerId === p1 ? p2 : p1;
  return false;
}

function advance(m, side) {
  // side: 'winner' | 'loser'
  if (m.status === 'done' || m.status === 'bye' || m.status === 'empty') return m[side];
  return undefined;
}

/**
 * 結果から全試合の状態を導出する。
 * @returns {{size, roundCount, rounds: object[][], thirdPlace: object|null, matches: object[],
 *   champion: string|null|undefined, finished: boolean, stale: string[]}}
 */
export function resolveBracket(t, tables = []) {
  const roundCount = Math.log2(t.size);
  const rounds = [];
  const stale = [];
  // 構造上の人数（その枠の下に何人いるか）で、最終的に不戦になる試合を判定する
  let counts = t.slots.map((p) => (p ? 1 : 0));
  const playable = [];

  for (let r = 1; r <= roundCount; r++) {
    const list = [];
    const prev = rounds[r - 2];
    const nextCounts = [];
    const matchCount = t.size / 2 ** r;
    for (let i = 0; i < matchCount; i++) {
      const id = matchId(r, i);
      const m = { id, round: r, index: i, p1: undefined, p2: undefined, winner: undefined, loser: undefined, result: null, startedAt: null };
      if (r === 1) {
        m.p1 = t.slots[2 * i] ?? null;
        m.p2 = t.slots[2 * i + 1] ?? null;
      } else {
        m.p1 = advance(prev[2 * i], 'winner');
        m.p2 = advance(prev[2 * i + 1], 'winner');
      }
      if (decide(m, t.results[id])) stale.push(id);
      applyStarted(m, t.started, true);
      const c1 = counts[2 * i];
      const c2 = counts[2 * i + 1];
      m.playable = c1 > 0 && c2 > 0; // 実際に試合が行われる（不戦でない）
      nextCounts.push(c1 + c2);
      list.push(m);
    }
    counts = nextCounts;
    rounds.push(list);
  }

  let third = null;
  if (t.thirdPlace && roundCount >= 2) {
    const semis = rounds[roundCount - 2];
    third = { id: THIRD_PLACE_ID, round: roundCount, index: -1, isThirdPlace: true, result: null,
      p1: advance(semis[0], 'loser'), p2: advance(semis[1], 'loser'), winner: undefined, loser: undefined, startedAt: null };
    if (decide(third, t.results[THIRD_PLACE_ID])) stale.push(THIRD_PLACE_ID);
    applyStarted(third, t.started, true);
    // 準決勝が両方とも実際の試合なら3位決定戦も実際の試合
    third.playable = semis[0].playable && semis[1].playable;
  }

  // 試合番号・卓・時間帯（ラウンドごと、実際に行う試合のみ）
  let no = 0;
  for (let r = 1; r <= roundCount; r++) {
    const list = rounds[r - 1].filter((m) => m.playable);
    if (r === roundCount && third && third.playable) list.unshift(third); // 3位決定戦は決勝の前
    list.forEach((m, seq) => {
      m.no = ++no;
      Object.assign(m, assignTable(seq, tables, t.tableOverrides?.[m.id]));
      playable.push(m);
    });
  }

  // 存在しない試合IDの結果も stale とする
  const known = new Set(rounds.flat().map((m) => m.id));
  if (third) known.add(THIRD_PLACE_ID);
  for (const id of Object.keys(t.results)) if (!known.has(id)) stale.push(id);

  const final = rounds[roundCount - 1][0];
  const champion = advance(final, 'winner');
  const finished = champion !== undefined && (!third || advance(third, 'winner') !== undefined);
  const matches = rounds.flat();
  if (third) matches.push(third);
  return { size: t.size, roundCount, rounds, thirdPlace: third, matches, playable, champion, finished, stale };
}

function findMatch(res, id) {
  return res.matches.find((m) => m.id === id);
}

function withResults(t, results) {
  return { ...t, results };
}

/** 矛盾した（対戦者が変わった）結果を連鎖的に取り除く */
export function cleanStale(t) {
  let cur = t;
  const cleared = [];
  for (;;) {
    const res = resolveBracket(cur);
    if (!res.stale.length) return { tournament: cur, cleared };
    const results = { ...cur.results };
    for (const id of res.stale) {
      delete results[id];
      cleared.push(id);
    }
    cur = withResults(cur, results);
  }
}

/**
 * 結果を設定する（input が null なら取消）。
 * @returns {{ok:true, tournament, cleared:string[]} | {ok:false, error:string}}
 *   cleared: この変更で無効になり消去された後続試合のID
 */
export function setTournamentResult(t, id, input) {
  const res = resolveBracket(t);
  const m = findMatch(res, id);
  if (!m) return { ok: false, error: '試合が見つかりません' };
  const results = { ...t.results };
  if (input === null) {
    delete results[id];
  } else {
    if (m.status !== 'ready' && m.status !== 'done') {
      return { ok: false, error: m.status === 'waiting' ? '対戦者がまだ決まっていません' : '不戦のため結果は入力できません' };
    }
    const v = normalizeResultInput(input, { allowDraw: false });
    if (!v.ok) return v;
    const { outcome, score1, score2, walkover } = v.value;
    results[id] = { p1: m.p1, p2: m.p2, winnerId: outcome === 'p1' ? m.p1 : m.p2, score1, score2, walkover };
  }
  const { tournament, cleared } = cleanStale(withResults(t, results));
  return { ok: true, tournament: pruneStarted(tournament), cleared: cleared.filter((c) => c !== id) };
}

/** 開始が無効になった試合（結果が入った・対戦者が変わった・まだ始められない）の開始時刻を取り除く */
export function pruneStarted(t) {
  if (!t.started || !Object.keys(t.started).length) return t;
  const res = resolveBracket(t);
  const started = {};
  for (const m of res.matches) if (m.startedAt) started[m.id] = t.started[m.id];
  return { ...t, started };
}

/**
 * 試合を開始する（進行中にする）。at が null なら開始を取り消す。開始できるのは、対戦者が決まっていて結果が入っていない試合。
 * @returns {{ok:true, tournament} | {ok:false, error:string}}
 */
export function setTournamentStarted(t, id, at) {
  const m = findMatch(resolveBracket(t), id);
  if (!m || !m.playable) return { ok: false, error: '試合が見つかりません' };
  const started = { ...(t.started || {}) };
  if (at === null) {
    delete started[id];
  } else {
    if (!isStartTime(at)) return { ok: false, error: '開始時刻が正しくありません' };
    if (m.status === 'waiting') return { ok: false, error: '対戦者がまだ決まっていません' };
    if (m.status !== 'ready') return { ok: false, error: '結果が入力済みの試合は開始できません' };
    if (m.startedAt) return { ok: true, tournament: t }; // すでに開始している（開始時刻は変えない）
    started[id] = { at, p1: m.p1, p2: m.p2 };
  }
  return { ok: true, tournament: { ...t, started } };
}

/** 卓を手動で変更する（tableId が null なら自動割当に戻す） */
export function setTournamentTable(t, id, tableId) {
  const tableOverrides = { ...(t.tableOverrides || {}) };
  if (tableId) tableOverrides[id] = tableId;
  else delete tableOverrides[id];
  return { ...t, tableOverrides };
}

/** 生成時の名簿から削除された選手が含まれているか */
export function missingPlayers(t, players) {
  const ids = new Set(players.map((p) => p.id));
  return t.playerIds.filter((id) => !ids.has(id));
}

/**
 * トーナメントの順位。並びは、勝ち残っている選手（phase 'alive'）→3位決定戦へ進む選手（'third'）→敗退・確定した選手（'out'。順位の高い順）。
 * 大会が終わると、1〜3位に medal（'gold'・'silver'・'bronze'）が付く。
 * @returns {{playerId, rank:number|null, label:string, wins:number, losses:number, phase:'alive'|'third'|'out', medal:'gold'|'silver'|'bronze'|null}[]}
 */
export function tournamentRanking(t, res = resolveBracket(t)) {
  const R = res.roundCount;
  const info = new Map(t.playerIds.map((id) => [id, { playerId: id, rank: null, label: '勝ち残り', wins: 0, losses: 0 }]));
  for (const m of res.matches) {
    if (m.status !== 'done') continue;
    const w = info.get(m.winner);
    const l = info.get(m.loser);
    if (w) w.wins++;
    if (l) l.losses++;
  }
  for (const m of res.rounds.flat()) {
    if (m.status !== 'done') continue;
    const l = info.get(m.loser);
    if (!l) continue;
    if (m.round === R) {
      Object.assign(l, { rank: 2, label: '準優勝' });
    } else if (m.round === R - 1) {
      if (res.thirdPlace) Object.assign(l, { rank: null, label: '3位決定戦へ' });
      else Object.assign(l, { rank: 3, label: '3位' });
    } else {
      Object.assign(l, { rank: 2 ** (R - m.round) + 1, label: `${roundName(m.round, R)}敗退` });
    }
  }
  if (res.champion) Object.assign(info.get(res.champion) ?? {}, { rank: 1, label: '優勝' });
  const tp = res.thirdPlace;
  if (tp && (tp.status === 'done' || tp.status === 'bye')) {
    if (info.has(tp.winner)) Object.assign(info.get(tp.winner), { rank: 3, label: '3位' });
    if (tp.loser && info.has(tp.loser)) Object.assign(info.get(tp.loser), { rank: 4, label: '4位' });
  }
  const medals = { 1: 'gold', 2: 'silver', 3: 'bronze' };
  for (const r of info.values()) {
    r.phase = r.rank !== null ? 'out' : r.label === '勝ち残り' ? 'alive' : 'third';
    r.medal = res.finished ? medals[r.rank] ?? null : null;
  }
  const order = new Map(t.playerIds.map((id, i) => [id, i]));
  const group = { alive: 0, third: 1, out: 2 };
  return [...info.values()].sort((a, b) => {
    if (a.phase !== b.phase) return group[a.phase] - group[b.phase];
    const ra = a.rank ?? Infinity;
    const rb = b.rank ?? Infinity;
    if (ra !== rb) return ra - rb;
    return order.get(a.playerId) - order.get(b.playerId);
  });
}

/**
 * 表彰（優勝・準優勝・3位）。決勝と、3位決定戦があればそれも終わったときだけ返す（途中は null）。
 * 3位決定戦がないときは、準決勝で敗れた選手（最大2人）がどちらも3位。2人の大会は3位なし。
 * @returns {{first:string, second:string|null, thirds:string[]}|null} 選手の ID
 */
export function tournamentPodium(t, res = resolveBracket(t)) {
  if (!res.finished) return null;
  const rows = tournamentRanking(t, res);
  const at = (rank) => rows.filter((r) => r.rank === rank).map((r) => r.playerId);
  const first = at(1)[0];
  if (!first) return null;
  return { first, second: at(2)[0] ?? null, thirds: at(3) };
}

export function tournamentProgress(res) {
  const total = res.playable.length;
  const done = res.playable.filter((m) => m.status === 'done').length;
  const ready = res.playable.filter((m) => m.status === 'ready');
  return { total, done, ready };
}
