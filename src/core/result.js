// 試合結果の入力値チェック（トーナメント・総当たり共通）

export const MAX_SCORE = 9999;

function parseScore(v) {
  if (v === null || v === undefined) return { empty: true };
  const s = String(v).trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (s === '') return { empty: true };
  if (!/^\d+$/.test(s)) return { error: 'スコアは0以上の整数で入力してください' };
  const n = Number(s);
  if (n > MAX_SCORE) return { error: `スコアは${MAX_SCORE}以下で入力してください` };
  return { value: n };
}

/**
 * 入力値を検証し、保存用の結果に整える。
 * @param {{score1?:any, score2?:any, outcome?:'p1'|'p2'|'draw'|null, walkover?:boolean}} input
 * @param {{allowDraw:boolean}} opts
 * @returns {{ok:true, value:{outcome:string, score1:number|null, score2:number|null, walkover:boolean}} | {ok:false, error:string}}
 */
export function normalizeResultInput(input, { allowDraw }) {
  const outcome = input.outcome || null;
  const walkover = !!input.walkover;
  // 勝敗は p1・p2・draw のどれか（未指定も可）に限る。それ以外を保存すると、保存したデータを読み込めなくなる
  if (outcome !== null && !['p1', 'p2', 'draw'].includes(outcome)) return { ok: false, error: '勝者の指定が正しくありません' };

  if (walkover) {
    if (outcome !== 'p1' && outcome !== 'p2') return { ok: false, error: '不戦勝の勝者を選んでください' };
    return { ok: true, value: { outcome, score1: null, score2: null, walkover: true } };
  }

  const a = parseScore(input.score1);
  const b = parseScore(input.score2);
  if (a.error) return { ok: false, error: a.error };
  if (b.error) return { ok: false, error: b.error };
  if (a.empty !== b.empty) return { ok: false, error: 'スコアは両方入力するか、両方空欄にしてください' };

  if (a.empty) {
    if (!outcome) return { ok: false, error: '勝者を選ぶか、スコアを入力してください' };
    if (outcome === 'draw' && !allowDraw) return { ok: false, error: '引き分けにはできません。勝者を選んでください' };
    return { ok: true, value: { outcome, score1: null, score2: null, walkover: false } };
  }

  const s1 = a.value;
  const s2 = b.value;
  if (s1 !== s2) {
    const byScore = s1 > s2 ? 'p1' : 'p2';
    if (outcome && outcome !== byScore) return { ok: false, error: 'スコアと勝者が一致しません' };
    return { ok: true, value: { outcome: byScore, score1: s1, score2: s2, walkover: false } };
  }
  // 同点
  if (outcome === 'p1' || outcome === 'p2') {
    return { ok: true, value: { outcome, score1: s1, score2: s2, walkover: false } };
  }
  if (!allowDraw) return { ok: false, error: '同点です。勝者（代表戦などの勝者）を選んでください' };
  return { ok: true, value: { outcome: 'draw', score1: s1, score2: s2, walkover: false } };
}

/** 卓の割当。override が有効な卓IDならそれを使い、なければ順番に割り当てる */
export function assignTable(seq, tables, overrideId) {
  if (!tables.length) return { tableId: null, timeSlot: null };
  if (overrideId && tables.some((t) => t.id === overrideId)) {
    return { tableId: overrideId, timeSlot: Math.floor(seq / tables.length) + 1 };
  }
  return { tableId: tables[seq % tables.length].id, timeSlot: Math.floor(seq / tables.length) + 1 };
}

export function formatScore(r) {
  if (!r) return '';
  if (r.walkover) return '不戦勝';
  if (r.score1 === null || r.score1 === undefined) return '';
  return `${r.score1}-${r.score2}`;
}

/**
 * 結果を保存したあとに開く「次の試合」を選ぶ。今の試合より後ろの番号のうち最も早いもの。
 * 後ろに無ければ先頭の試合へ戻る（前のほうに入力漏れの試合があるため）。
 * @param {{no:number}[]} candidates 次に行える試合（結果未入力のもの）
 * @param {number} currentNo 今の試合の番号
 */
export function pickNextMatch(candidates, currentNo) {
  const others = candidates.filter((m) => m.no !== currentNo).sort((a, b) => a.no - b.no);
  return others.find((m) => m.no > currentNo) || others[0] || null;
}
