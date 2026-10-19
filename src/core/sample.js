// 「サンプルで試す」: 参加者がいないときに、架空の8人と卓2つを入れて、トーナメント表を作るところまで進める。

import { makePlayers, resizeTables } from './players.js';
import { generateTournament } from './bracket.js';
import { planSeeds } from './seeds.js';

export const SAMPLE_TITLE = 'サンプル大会';
export const SAMPLE_NAMES = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎', '田中 三郎', '伊藤 四郎', '渡辺 五郎', '中村 六子'];
export const SAMPLE_TABLES = 2;

/**
 * サンプルの大会データ。参加者がすでにいるときは作らない（今の名簿を消さないため）。
 * 卓は、今の卓名を残して2つにする。回・過去の大会・設定はそのまま。
 * @returns {{ok:true, state:object} | {ok:false, error:string}}
 */
export function sampleState(state) {
  if (!state || !Array.isArray(state.players)) return { ok: false, error: '大会データが正しくありません' };
  if (state.players.length) return { ok: false, error: '参加者がいるときは、サンプルを入れられません' };
  const players = makePlayers(SAMPLE_NAMES);
  const plan = planSeeds(players, state.settings);
  return {
    ok: true,
    state: {
      ...state,
      meta: { ...state.meta, title: SAMPLE_TITLE },
      players,
      tables: resizeTables(state.tables, SAMPLE_TABLES),
      tournament: generateTournament(plan.playerIds, { ...state.settings, seedCount: plan.seedCount }),
      league: null,
    },
  };
}
