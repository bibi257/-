// 呼び出し画面の別ウィンドウとの通知（同じ端末内。共有サーバーは使わない）。
// 運営の画面で保存するたびに、BroadcastChannel で知らせる。使えないときは、保存（localStorage への書き込み）そのものが
// 別ウィンドウの storage イベントになる。

import { callViewUrl } from '../core/callView.js';
import { STORAGE_KEY, onSaved } from './store.js';

const CHANNEL = 'bukatsu-taikai:call';
const WINDOW_NAME = 'bukatsu-call';

export function openChannel() {
  try {
    return typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;
  } catch {
    return null;
  }
}

/** 運営の画面: 保存のたびに、開いている別ウィンドウへ知らせる */
export function setupCallNotify() {
  const ch = openChannel();
  if (ch) onSaved(() => ch.postMessage('saved'));
}

/** 運営の画面: 呼び出し画面を別ウィンドウで開く。ポップアップを止められたときは false */
export function openCallWindow(kind) {
  const w = window.open(callViewUrl(location.href, kind), WINDOW_NAME, 'popup,width=1280,height=720');
  if (!w) return false;
  try { w.focus(); } catch { /* 無視 */ }
  return true;
}

/** 別ウィンドウ側: 運営の画面の保存を受け取ったら f を呼ぶ */
export function listenCallUpdate(f) {
  const ch = openChannel();
  if (ch) ch.onmessage = () => f();
  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY || e.key === null) f(); });
}
