// 大会データの初期値・検証・移行

import { resizeTables } from './players.js';
import { DEFAULT_POINTS } from './league.js';
import { MAX_PLAYERS, bracketSize } from './bracket.js';

export const STATE_VERSION = 1;
export const FILE_KIND = 'bukatsu-taikai';

export function defaultSettings() {
  return {
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
    meta: { title: '部内大会', date: '', updatedAt: null },
    players: [],
    tables: resizeTables([], 2),
    settings: defaultSettings(),
    tournament: null,
    league: null,
  };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';

function checkResults(obj, label) {
  if (!isObj(obj)) throw new Error(`${label}の結果データが不正です`);
}

/**
 * 読み込んだデータを検証し、足りない項目を補う。
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
    if (!Array.isArray(data.players) || data.players.some((p) => !isObj(p) || !isStr(p.id) || !isStr(p.name))) {
      throw new Error('参加者データが不正です');
    }
    if (data.players.length > MAX_PLAYERS) throw new Error('参加者が多すぎます');
    if (!Array.isArray(data.tables) || !data.tables.length || data.tables.some((t) => !isObj(t) || !isStr(t.id) || !isStr(t.name))) {
      throw new Error('卓データが不正です');
    }
    const st = {
      ...base,
      meta: { ...base.meta, ...(isObj(data.meta) ? data.meta : {}) },
      players: data.players.map((p) => ({ id: p.id, name: p.name })),
      tables: data.tables.map((t) => ({ id: t.id, name: t.name })),
      settings: {
        ...base.settings,
        ...(isObj(data.settings) ? data.settings : {}),
        league: { ...base.settings.league, ...(isObj(data.settings?.league) ? data.settings.league : {}) },
      },
      tournament: null,
      league: null,
    };
    const t = data.tournament;
    if (t) {
      if (!isObj(t) || !Array.isArray(t.slots) || t.size !== bracketSize(Math.max(2, t.size)) || t.slots.length !== t.size || !Array.isArray(t.playerIds)) {
        throw new Error('トーナメントデータが不正です');
      }
      checkResults(t.results, 'トーナメント');
      st.tournament = { ...t, tableOverrides: isObj(t.tableOverrides) ? t.tableOverrides : {} };
    }
    const l = data.league;
    if (l) {
      if (!isObj(l) || !Array.isArray(l.matches) || !Array.isArray(l.playerIds) ||
        l.matches.some((m) => !isObj(m) || !isStr(m.id) || typeof m.round !== 'number')) {
        throw new Error('総当たりデータが不正です');
      }
      checkResults(l.results, '総当たり');
      st.league = { ...l, tableOverrides: isObj(l.tableOverrides) ? l.tableOverrides : {} };
    }
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
