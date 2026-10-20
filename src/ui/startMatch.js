// 試合の「開始」（進行中にする）と、その取り消し。経過時間（分）の表示の更新。
// 運営の画面だけで押せる（閲覧者は、進行中の表示と経過時間だけ見える）。

import { getState, setState, isReadOnly } from './store.js';
import { toast } from './io.js';
import { setTournamentStarted } from '../core/bracket.js';
import { setLeagueStarted } from '../core/league.js';
import { busyOnSameTable } from '../core/tableBoard.js';
import { elapsedMinutes } from '../core/started.js';

/** 試合を開始する（starting=true）か、開始を取り消す。kind は 'tournament' か 'league' */
export function changeStart(kind, id, starting) {
  if (isReadOnly()) return;
  const st = getState();
  if (!st[kind]) return;
  if (starting) {
    const busy = busyOnSameTable(st, kind, id);
    if (busy && !confirm(`${busy.table}では、No.${busy.no}（${busy.p1} 対 ${busy.p2}・${busy.minutes}分）が進行中です。この試合も開始しますか？`)) return;
  }
  const at = starting ? new Date().toISOString() : null;
  const r = kind === 'league' ? setLeagueStarted(st.league, id, at) : setTournamentStarted(st.tournament, id, at);
  if (!r.ok) { toast(r.error, { error: true }); return; }
  setState({ ...st, [kind]: kind === 'league' ? r.league : r.tournament });
  toast(starting ? '試合を開始しました' : '開始を取り消しました');
}

/** 「開始」のボタンを受ける（「開始を取り消す」は、結果入力シートの中）。kind は 'tournament' か 'league' */
export function setupStartButtons(panel, kind) {
  panel.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('[data-start]') : null;
    if (b) changeStart(kind, b.dataset.start, true);
  });
}

/** 画面の中の経過時間（data-started を持つ要素）を、今の時刻で書き直す */
export function updateElapsed() {
  document.querySelectorAll('[data-started]').forEach((el) => {
    const text = `${elapsedMinutes(el.dataset.started)}分`;
    if (el.textContent !== text) el.textContent = text;
  });
}

/** 画面を描き直さなくても、経過時間が進む（20秒ごと） */
export function setupElapsedTimer() {
  setInterval(updateElapsed, 20000);
}
