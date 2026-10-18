// 各表の上の「出力」ボタンと、CSV・画像（PNG）・印刷を選ぶ小さなメニュー。
// 項目のボタンは、これまでと同じ data-export を持つ（出力の処理は各タブが data-export で受ける）。

import { h } from './io.js';

/**
 * @param {{label:string, csv:string, png:string}[]} tables 出力できる表。csv・png は data-export の値。
 *   表が1つのときは「CSVで保存」、複数のときは「◯◯をCSVで保存」と表の名前を付ける
 */
export function exportMenuHtml(tables) {
  const items = tables.flatMap((t) => {
    const name = tables.length > 1 ? t.label : '';
    return [[t.csv, `${name}をCSVで保存`.replace(/^を/, '')], [t.png, `${name}を画像（PNG）で保存`.replace(/^を/, '')]];
  });
  items.push(['print', '印刷']);
  return `<span class="export-menu">
    <button type="button" class="small export-toggle" data-export-toggle aria-haspopup="true" aria-expanded="false">出力 <span aria-hidden="true">▾</span></button>
    <div class="export-list" role="menu" aria-label="出力" hidden>
      ${items.map(([kind, label]) => `<button type="button" role="menuitem" data-export="${h(kind)}">${h(label)}</button>`).join('\n      ')}
    </div></span>`;
}

function setOpen(menu, open, { focus = false } = {}) {
  const toggle = menu.querySelector('[data-export-toggle]');
  const list = menu.querySelector('.export-list');
  list.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  if (open && focus) list.querySelector('button')?.focus();
  return toggle;
}

const openMenus = () => [...document.querySelectorAll('.export-menu')].filter((m) => !m.querySelector('.export-list').hidden);

/** 表の描き直しでメニューは作り直される。ここでは、文書全体で開け閉めを受ける */
export function setupExportMenus() {
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const toggle = t.closest('[data-export-toggle]');
    const menu = toggle?.closest('.export-menu');
    // 開いている別のメニューは閉じる
    for (const m of openMenus()) if (m !== menu) setOpen(m, false);
    if (toggle && menu) {
      const open = menu.querySelector('.export-list').hidden;
      setOpen(menu, open, { focus: open && e.detail === 0 }); // キーボードで開いたときだけ、最初の項目へ移る
    } else if (t.closest('.export-list')) {
      // 項目を選んだら閉じる（出力そのものは、各タブが data-export で処理する）
      const m = t.closest('.export-menu');
      setOpen(m, false).focus();
    }
  });
  document.addEventListener('keydown', (e) => {
    const m = openMenus()[0];
    if (!m) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(m, false).focus(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [...m.querySelectorAll('.export-list button')];
      const i = items.indexOf(document.activeElement);
      if (i === -1 && document.activeElement !== m.querySelector('[data-export-toggle]')) return;
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[i === -1 && e.key === 'ArrowUp' ? items.length - 1 : next].focus();
    }
  });
  // フォーカスがメニューの外へ出たら閉じる（Tab で抜けたとき）
  document.addEventListener('focusin', (e) => {
    for (const m of openMenus()) if (!m.contains(e.target)) setOpen(m, false);
  });
}
