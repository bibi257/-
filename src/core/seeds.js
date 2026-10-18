// シードの決め方。「指名」（名簿でチェックした選手）か「ランダム」（人数を指定して抽選）。

import { shuffle } from './bracket.js';

export const SEED_MODES = ['none', 'random', 'pick'];

/** 名簿にいる選手だけの指名（名簿順・重複なし） */
function pickedPlayers(players, settings) {
  const picked = new Set(settings.seedIds ?? []);
  return players.filter((p) => picked.has(p.id));
}

/** 実際にシードになる人数（表示用） */
export function effectiveSeedCount(settings, players) {
  if (settings.seedMode === 'pick') return pickedPlayers(players, settings).length;
  if (settings.seedMode === 'random') return Math.max(0, Math.min(settings.seedCount | 0, players.length));
  return 0;
}

/**
 * トーナメント生成に渡す並びを作る。先頭 seedCount 人がシードで、シードの順位は並びの順。
 * 指名: チェックした選手を名簿順に先頭へ（シード順位は名簿の上から）。ランダム: 全員から抽選。
 * @returns {{playerIds:string[], seedCount:number}}
 */
export function planSeeds(players, settings, rng = Math.random) {
  const ids = players.map((p) => p.id);
  if (settings.seedMode === 'pick') {
    const seeds = pickedPlayers(players, settings).map((p) => p.id);
    const set = new Set(seeds);
    return { playerIds: [...seeds, ...ids.filter((id) => !set.has(id))], seedCount: seeds.length };
  }
  if (settings.seedMode === 'random') {
    const n = effectiveSeedCount(settings, players);
    const seeds = shuffle(ids, rng).slice(0, n);
    const set = new Set(seeds);
    return { playerIds: [...seeds, ...ids.filter((id) => !set.has(id))], seedCount: n };
  }
  return { playerIds: ids, seedCount: 0 };
}

/** 指名のときの、各選手のシード順位（1, 2…）。指名でない・シードでない選手は含めない */
export function seedOrderNumbers(players, settings) {
  const out = new Map();
  if (settings.seedMode !== 'pick') return out;
  pickedPlayers(players, settings).forEach((p, i) => out.set(p.id, i + 1));
  return out;
}
