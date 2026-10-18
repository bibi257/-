// 大会データの初期値・検証・移行

import { resizeTables, MAX_TABLES } from './players.js';
import { DEFAULT_POINTS, MAX_LEAGUE_PLAYERS } from './league.js';
import { MAX_SCORE } from './result.js';
import { MAX_PLAYERS, bracketSize } from './bracket.js';
import { MAX_HISTORY } from './edition.js';
import { SEED_MODES } from './seeds.js';
import { isValidDate, isValidTime } from './schedule.js';

export const STATE_VERSION = 1;
export const FILE_KIND = 'bukatsu-taikai';

export function defaultSettings() {
  return {
    seedMode: 'none', // シードの決め方: 'none'（なし）／'random'（ランダム。人数は seedCount）／'pick'（名簿で指名。seedIds）
    seedIds: [],
    seedCount: 0,
    placement: 'order',
    thirdPlace: false,
    league: { ...DEFAULT_POINTS, allowDraw: true },
  };
}

export function createState() {
  return {
    kind: FILE_KIND,
    version: STATE_VERSION,
    meta: { title: '部内大会', date: '', time: '', updatedAt: null },
    players: [],
    tables: resizeTables([], 2),
    settings: defaultSettings(),
    tournament: null,
    league: null,
    history: [],
  };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';

/** 参加者・卓・試合の ID。画面の HTML 属性に入るため、英数字と - _ だけを許す */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const isId = (v) => isStr(v) && ID_PATTERN.test(v);

function fail(label) {
  throw new Error(`${label}データが不正です`);
}

/** ID の配列（重複なし）を検査する */
function checkIds(ids, label, max) {
  if (!Array.isArray(ids) || ids.length > max || ids.some((id) => !isId(id)) || new Set(ids).size !== ids.length) fail(label);
  return [...ids];
}

const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isScore = (v) => v === null || v === undefined || intIn(v, 0, MAX_SCORE);

function checkScores(r, label) {
  if (!isScore(r.score1) || !isScore(r.score2) || (r.walkover !== undefined && typeof r.walkover !== 'boolean')) fail(label);
  return { score1: r.score1 ?? null, score2: r.score2 ?? null, walkover: !!r.walkover };
}

/** 卓の手動割当（試合ID → 卓ID）。形式が違うものは捨てる（自動割当に戻るだけで害はない） */
function cleanOverrides(obj) {
  const out = {};
  if (!isObj(obj)) return out;
  for (const [k, v] of Object.entries(obj)) if (isId(k) && isId(v)) out[k] = v;
  return out;
}

function parseTournament(t) {
  const label = 'トーナメント';
  if (!isObj(t) || !intIn(t.size, 2, bracketSize(MAX_PLAYERS)) || t.size !== bracketSize(t.size)) fail(label);
  const playerIds = checkIds(t.playerIds, label, MAX_PLAYERS);
  if (playerIds.length < 2) fail(label);
  // 1回戦の枠: 名簿の全員がちょうど1回ずつ入り、残りは不戦（null）
  if (!Array.isArray(t.slots) || t.slots.length !== t.size || t.slots.some((s) => s !== null && !isId(s))) fail(label);
  const placed = t.slots.filter((s) => s !== null);
  const ids = new Set(playerIds);
  if (placed.length !== playerIds.length || new Set(placed).size !== placed.length || placed.some((s) => !ids.has(s))) fail(label);
  if (!isObj(t.results)) throw new Error(`${label}の結果データが不正です`);
  const results = {};
  for (const [id, r] of Object.entries(t.results)) {
    if (!isId(id) || !isObj(r) || !isId(r.p1) || !isId(r.p2) || (r.winnerId !== r.p1 && r.winnerId !== r.p2)) {
      throw new Error(`${label}の結果データが不正です`);
    }
    results[id] = { p1: r.p1, p2: r.p2, winnerId: r.winnerId, ...checkScores(r, `${label}の結果`) };
  }
  return {
    size: t.size,
    slots: [...t.slots],
    seedCount: intIn(t.seedCount, 0, playerIds.length) ? t.seedCount : 0,
    placement: t.placement === 'random' ? 'random' : 'order',
    thirdPlace: t.thirdPlace === true && t.size >= 4,
    playerIds,
    results,
    tableOverrides: cleanOverrides(t.tableOverrides),
  };
}

function parseLeague(l) {
  const label = '総当たり';
  if (!isObj(l)) fail(label);
  const playerIds = checkIds(l.playerIds, label, MAX_LEAGUE_PLAYERS);
  if (playerIds.length < 2 || !Array.isArray(l.matches)) fail(label);
  // 全員の組み合わせがちょうど1試合ずつあること（表の各マスが1試合に対応する）
  const ids = new Set(playerIds);
  const matchIds = new Set();
  const pairs = new Set();
  const matches = l.matches.map((m) => {
    if (!isObj(m) || !isId(m.id) || matchIds.has(m.id) || !intIn(m.round, 1, MAX_LEAGUE_PLAYERS) ||
      !ids.has(m.p1) || !ids.has(m.p2) || m.p1 === m.p2) fail(label);
    const pair = [m.p1, m.p2].sort().join('|');
    if (pairs.has(pair)) fail(label);
    matchIds.add(m.id);
    pairs.add(pair);
    return { id: m.id, round: m.round, p1: m.p1, p2: m.p2 };
  });
  if (matches.length !== (playerIds.length * (playerIds.length - 1)) / 2) fail(label);
  if (!isObj(l.results)) throw new Error(`${label}の結果データが不正です`);
  const results = {};
  for (const [id, r] of Object.entries(l.results)) {
    if (!matchIds.has(id) || !isObj(r) || !['p1', 'p2', 'draw'].includes(r.outcome)) {
      throw new Error(`${label}の結果データが不正です`);
    }
    results[id] = { outcome: r.outcome, ...checkScores(r, `${label}の結果`) };
  }
  return { playerIds, matches, results, tableOverrides: cleanOverrides(l.tableOverrides) };
}

/** シードの設定。古い形式（seedMode なし）で seedCount が1以上なら、名簿の上から指名した扱いにする */
function parseSeeds(src, base, players) {
  const seedCount = intIn(src.seedCount, 0, MAX_PLAYERS) ? src.seedCount : base.seedCount;
  const ids = new Set(players.map((p) => p.id));
  const clean = (list) => [...new Set(Array.isArray(list) ? list.filter((id) => isId(id) && ids.has(id)) : [])];
  if (!SEED_MODES.includes(src.seedMode)) {
    return seedCount > 0
      ? { seedMode: 'pick', seedIds: players.slice(0, seedCount).map((p) => p.id), seedCount }
      : { seedMode: 'none', seedIds: [], seedCount };
  }
  return { seedMode: src.seedMode, seedIds: clean(src.seedIds), seedCount };
}

function parseSettings(s, base, players) {
  const src = isObj(s) ? s : {};
  const lg = isObj(src.league) ? src.league : {};
  const pt = (v, fb) => (intIn(v, 0, 99) ? v : fb);
  return {
    ...parseSeeds(src, base, players),
    placement: src.placement === 'random' ? 'random' : 'order',
    thirdPlace: src.thirdPlace === true,
    league: {
      win: pt(lg.win, base.league.win),
      draw: pt(lg.draw, base.league.draw),
      loss: pt(lg.loss, base.league.loss),
      allowDraw: typeof lg.allowDraw === 'boolean' ? lg.allowDraw : base.league.allowDraw,
    },
  };
}

function parsePlayers(list) {
  if (!Array.isArray(list) || list.some((p) => !isObj(p) || !isId(p.id) || !isStr(p.name))) throw new Error('参加者データが不正です');
  if (list.length > MAX_PLAYERS) throw new Error('参加者が多すぎます');
  if (new Set(list.map((p) => p.id)).size !== list.length) throw new Error('参加者データが不正です');
  return list.map((p) => ({ id: p.id, name: p.name }));
}

function parseTables(list) {
  if (!Array.isArray(list) || !list.length || list.length > MAX_TABLES ||
    list.some((t) => !isObj(t) || !isId(t.id) || !isStr(t.name)) ||
    new Set(list.map((t) => t.id)).size !== list.length) {
    throw new Error('卓データが不正です');
  }
  return list.map((t) => ({ id: t.id, name: t.name }));
}

/** 過去の回。無い（古い形式のファイル）なら空。各回の中身も今の回と同じ検査を通す */
function parseHistory(list, baseSettings) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list) || list.length > MAX_HISTORY) fail('過去の大会の');
  const seen = new Set();
  return list.map((e) => {
    if (!isObj(e) || !intIn(e.edition, 1, 9999) || seen.has(e.edition)) fail('過去の大会の');
    seen.add(e.edition);
    const players = parsePlayers(e.players);
    return {
      edition: e.edition,
      date: isValidDate(e.date) ? e.date : '',
      time: isValidTime(e.time) ? e.time : '',
      archivedAt: isStr(e.archivedAt) ? e.archivedAt.slice(0, 40) : '',
      players,
      tables: parseTables(e.tables),
      settings: parseSettings(e.settings, baseSettings, players),
      tournament: e.tournament ? parseTournament(e.tournament) : null,
      league: e.league ? parseLeague(e.league) : null,
    };
  }).sort((a, b) => a.edition - b.edition);
}

/**
 * 読み込んだデータを検証し、足りない項目を補う。
 * 共有で受け取ったデータもここを通すため、画面に出す値（ID・数値）は形式まで確かめ、知らない項目は捨てる。
 * @returns {{ok:true, state} | {ok:false, error:string}}
 */
export function parseState(raw) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!isObj(data)) throw new Error('大会データの形式ではありません');
    if (data.kind !== FILE_KIND) throw new Error('このアプリで保存した大会データではありません');
    if (typeof data.version !== 'number' || data.version > STATE_VERSION) {
      throw new Error('新しいバージョンで保存されたデータのため読み込めません');
    }
    const base = createState();
    const players = parsePlayers(data.players);
    const tables = parseTables(data.tables);
    const meta = isObj(data.meta) ? data.meta : {};
    const st = {
      ...base,
      meta: {
        title: isStr(meta.title) ? meta.title : base.meta.title,
        date: isValidDate(meta.date) ? meta.date : '',
        time: isValidTime(meta.time) ? meta.time : '',
        updatedAt: isStr(meta.updatedAt) ? meta.updatedAt : null,
      },
      players,
      tables,
      settings: parseSettings(data.settings, base.settings, players),
      tournament: data.tournament ? parseTournament(data.tournament) : null,
      league: data.league ? parseLeague(data.league) : null,
      history: parseHistory(data.history, base.settings),
    };
    return { ok: true, state: st };
  } catch (e) {
    if (e instanceof SyntaxError) return { ok: false, error: 'JSON ファイルとして読み込めませんでした' };
    return { ok: false, error: e.message };
  }
}

export function serializeState(state) {
  return JSON.stringify({ ...state, meta: { ...state.meta, updatedAt: new Date().toISOString() } }, null, 2);
}

export function playerName(state, id) {
  if (id === null) return '（不戦）';
  if (id === undefined) return '';
  return state.players.find((p) => p.id === id)?.name ?? '（削除された参加者）';
}

export function tableName(state, id) {
  return state.tables.find((t) => t.id === id)?.name ?? '';
}
