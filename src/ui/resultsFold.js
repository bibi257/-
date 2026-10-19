// 「試合結果一覧」の折りたたみ。スマホ幅の「回戦ごと」表示のときだけ畳める（初期は閉じる）。
// PC 幅・表の表示・印刷では、常に開いたまま（見出しを押しても閉じない）。開閉の選択は、画面を作り直しても保つ。

import { h } from './io.js';

const MOBILE = '(max-width: 700px)';
const choice = new Map(); // key → 畳めるときに利用者が開いたか

/** 幅 700px 以下か */
export const isMobile = () => window.matchMedia(MOBILE).matches;

/** 折りたたみ全体。見出し（title）の右に件数を出す */
export function foldHtml({ key, title, count, body }) {
  return `<details class="fold results-fold" data-fold="${h(key)}"><summary><h2>${h(title)}</h2><span class="fold-count">${h(count)}</span></summary>${body}</details>`;
}

/** 今の状態に合わせて開閉を決める。畳めないときは開いたまま、畳めるときは利用者の選択（初期は閉じる） */
export function syncFold(root, key, collapsible) {
  const d = root.querySelector(`details[data-fold="${key}"]`);
  if (!d) return;
  d.open = collapsible() ? choice.get(key) === true : true;
  d.classList.toggle('fold-locked', !collapsible());
}

/** 見出しを押したときの開閉と、画面幅の変化・印刷のときの開閉。タブごとに1回だけ呼ぶ */
export function setupFold(root, key, collapsible) {
  root.addEventListener('click', (e) => {
    const sum = e.target instanceof Element ? e.target.closest('summary') : null;
    const d = sum?.closest('details[data-fold]');
    if (!d || d.dataset.fold !== key) return;
    e.preventDefault(); // 開閉は自分で決める（畳めないときは何も起きない）
    if (!collapsible()) return;
    d.open = !d.open;
    choice.set(key, d.open);
  });
  window.matchMedia(MOBILE).addEventListener?.('change', () => syncFold(root, key, collapsible));
  // 印刷は、畳んでいても全試合を出す
  let was = null;
  window.addEventListener('beforeprint', () => {
    was = [...root.querySelectorAll('details.fold')].map((d) => [d, d.open]);
    was.forEach(([d]) => { d.open = true; });
  });
  window.addEventListener('afterprint', () => {
    was?.forEach(([d, open]) => { d.open = open; });
    was = null;
  });
}
