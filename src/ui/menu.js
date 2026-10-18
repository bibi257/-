// スマホ幅のヘッダーのメニュー（新規・保存・読込・印刷・共有）。PC 幅ではボタンが並んだまま、このメニューは使わない。

const MOBILE = '(max-width: 700px)';

export function setupMenu() {
  const header = document.getElementById('app-header');
  const button = document.getElementById('menu-btn');
  const panel = document.getElementById('header-actions');
  if (!header || !button || !panel) return;

  const isOpen = () => header.classList.contains('menu-open');
  const setOpen = (open) => {
    header.classList.toggle('menu-open', open);
    button.setAttribute('aria-expanded', String(open));
  };

  button.addEventListener('click', () => setOpen(!isOpen()));
  // 項目を選んだら閉じる（操作そのものは main.js が data-action で処理する）
  panel.addEventListener('click', (e) => { if (e.target.closest('button')) setOpen(false); });
  // メニューの外を押したら閉じる
  document.addEventListener('click', (e) => { if (isOpen() && !header.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { setOpen(false); button.focus(); }
  });
  // 画面を広げたら閉じた状態に戻す
  window.matchMedia(MOBILE).addEventListener('change', (e) => { if (!e.matches) setOpen(false); });
}
