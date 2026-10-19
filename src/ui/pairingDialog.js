// トーナメント表を作る前の「組み合わせの確認」。1回戦の組を一覧にし、タップ2回で2人の選手を入れ替える。
// 確定するまで大会データは変えない（確定した表を返すだけ）。

import { h } from './io.js';
import { resolveBracket, swapSlots } from '../core/bracket.js';

/**
 * @param {{
 *   make:(slots?:(string|null)[])=>object,   // 配置（省略なら自動）から表を作る
 *   redraw:(()=>void)|null,                   // 抽選をやり直す（シード・配置がランダムのときだけ渡す）
 *   tables:{id:string,name:string}[],
 *   nameOf:(id:string)=>string,
 *   seedNo:()=>Map<string,number>,            // シードの選手と、そのシード順位
 *   absentIds?:Set<string>,                   // 欠席の選手（一覧に「欠席」と添える）
 * }} cfg
 * @returns {Promise<object|null>} 確定した表。キャンセルなら null
 */
export function openPairing({ make, redraw, tables, nameOf, seedNo, absentIds = new Set() }) {
  const dlg = document.getElementById('pairing-dialog');
  const list = document.getElementById('pr-list');
  const status = document.getElementById('pr-status');
  const redrawBtn = document.getElementById('pr-redraw');
  const okBtn = document.getElementById('pr-ok');
  const cancelBtn = document.getElementById('pr-cancel');
  let t = make();
  let picked = null; // 入れ替えの1人目（1回戦の枠の番号）

  const player = (slot, seeds) => {
    const id = t.slots[slot];
    const seed = seeds.get(id);
    return `<button type="button" class="pr-p${picked === slot ? ' sel' : ''}" data-slot="${slot}" aria-pressed="${picked === slot}">`
      + `<span class="pr-name">${h(nameOf(id))}</span>`
      + `${seed ? `<span class="seed-badge">第${seed}シード</span>` : ''}${absentIds.has(id) ? '<span class="pr-absent">欠席</span>' : ''}</button>`;
  };

  function render(focusSlot = null) {
    const res = resolveBracket(t, tables);
    const seeds = seedNo(); // 描くたびに1回だけ作る
    list.innerHTML = res.rounds[0].map((m) => {
      const a = 2 * m.index;
      if (t.slots[a] === null || t.slots[a + 1] === null) {
        const s = t.slots[a] === null ? a + 1 : a;
        return `<li class="pr-row pr-bye"><span class="pr-no">不戦</span>${player(s, seeds)}<span class="pr-note">1回戦は不戦で、2回戦へ進みます</span></li>`;
      }
      const table = tables.find((x) => x.id === m.tableId)?.name ?? '';
      return `<li class="pr-row"><span class="pr-no">No.${m.no}</span>${player(a, seeds)}<span class="pr-vs">vs</span>${player(a + 1, seeds)}`
        + `<span class="pr-table">${h(table)}${m.timeSlot > 1 ? `・時間帯${m.timeSlot}` : ''}</span></li>`;
    }).join('');
    redrawBtn.hidden = !redraw;
    if (focusSlot !== null) list.querySelector(`button[data-slot="${focusSlot}"]`)?.focus();
  }

  function say(text) {
    status.textContent = text;
  }

  return new Promise((resolve) => {
    const finish = (value) => {
      list.removeEventListener('click', onPick);
      redrawBtn.removeEventListener('click', onRedraw);
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      dlg.removeEventListener('close', onCancel);
      if (dlg.open) dlg.close();
      resolve(value);
    };
    const onOk = () => finish(t);
    const onCancel = () => finish(null); // 「キャンセル」・Esc
    const onRedraw = () => {
      redraw();
      t = make();
      picked = null;
      say('抽選をやり直しました。');
      render();
    };
    const onPick = (e) => {
      const btn = e.target.closest('button[data-slot]');
      if (!btn) return;
      const slot = Number(btn.dataset.slot);
      if (picked === null) {
        picked = slot;
        say(`「${nameOf(t.slots[slot])}」を選びました。入れ替える相手の選手を押してください（もう一度押すと選び直せます）。`);
        render(slot);
      } else if (picked === slot) {
        picked = null;
        say('選択を外しました。');
        render(slot);
      } else {
        const a = nameOf(t.slots[picked]);
        const b = nameOf(t.slots[slot]);
        t = make(swapSlots(t.slots, picked, slot));
        picked = null;
        say(`「${a}」と「${b}」を入れ替えました。`);
        render(slot);
      }
    };
    list.addEventListener('click', onPick);
    redrawBtn.addEventListener('click', onRedraw);
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    dlg.addEventListener('close', onCancel);
    say('');
    render();
    dlg.showModal();
    okBtn.focus();
  });
}
