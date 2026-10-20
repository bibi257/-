// スマホ幅のヘッダーのメニュー（元に戻す・共有・印刷・保存・読込・新しい大会を始める）。PC 幅ではボタンが並んだまま、このメニューは使わない。
// 開いている間は、下の画面を暗くし（暗幕を押すと閉じる）、Tab はメニューの中だけを回る。Esc で閉じて、メニューのボタンにフォーカスを戻す。

const MOBILE = '(max-width: 700px)';

export function setupMenu() {
  const header = document.getElementById('app-header');
  const button = document.getElementById('menu-btn');
  const panel = document.getElementById('header-actions');
  const scrim = document.getElementById('menu-scrim');
  if (!header || !button || !panel) return;

  const isOpen = () => header.classList.contains('menu-open');
  const setOpen = (open) => {
    header.classList.toggle('menu-open', open);
    button.setAttribute('aria-expanded', String(open));
    if (scrim) scrim.hidden = !open;
  };

  button.addEventListener('click', () => setOpen(!isOpen()));
  // 項目を選んだら閉じる（操作そのものは main.js が data-action で処理する）
  panel.addEventListener('click', (e) => { if (e.target.closest('button')) setOpen(false); });
  // 暗幕・メニューの外を押したら閉じる
  scrim?.addEventListener('click', () => setOpen(false));
  document.addEventListener('click', (e) => { if (isOpen() && !header.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { setOpen(false); button.focus(); return; }
    if (e.key !== 'Tab') return;
    // Tab はメニューの中（メニューのボタン＋見えている項目）だけを回る
    const items = [button, ...panel.querySelectorAll('button')].filter((el) => !el.disabled && el.getClientRects().length > 0);
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!items.includes(document.activeElement)) { e.preventDefault(); first.focus(); }
  });
  // 画面を広げたら閉じた状態に戻す
  window.matchMedia(MOBILE).addEventListener('change', (e) => { if (!e.matches) setOpen(false); });
}
