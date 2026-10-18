// 位置までスクロールして、1.5秒強調する部品（トーナメント・総当たりで共用）

export const FLASH_MS = 1500;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** 動きを減らす設定のときは、すぐに移動する */
export const scrollBehavior = () => (reducedMotion() ? 'auto' : 'smooth');

/** 強調の枠を1.5秒付ける（CSS の .flash） */
export function flash(el) {
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), FLASH_MS);
}
