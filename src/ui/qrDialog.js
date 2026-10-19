// 閲覧リンクのQRコードを大きく見せる画面（会場の掲示・スクリーン向け）。

import { toast, downloadPNG } from './io.js';
import { encodeQr } from '../core/qr.js';
import { qrSvg } from '../render/qr.js';
import { getState } from './store.js';
import { eventTitle } from '../core/edition.js';

const $ = (id) => document.getElementById(id);
let current = null; // 表示中の { link, svg }

/** QRコードを開く。リンクが長すぎてQRコードにできないときは、通知を出して開かない */
export function openQr(link) {
  let qr;
  try {
    qr = encodeQr(link);
  } catch (e) {
    toast(e.message, { error: true });
    return;
  }
  const art = qrSvg(qr);
  current = { link, art };
  $('qr-title').textContent = eventTitle(getState());
  $('qr-img').innerHTML = art.svg;
  $('qr-link').textContent = link;
  const dlg = $('qr-dialog');
  if (!dlg.open) dlg.showModal();
}

export function setupQrDialog() {
  const dlg = $('qr-dialog');
  const full = $('qr-full');
  full.hidden = !dlg.requestFullscreen;
  full.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await dlg.requestFullscreen();
    } catch { /* 全画面にできない環境では何もしない */ }
  });
  $('qr-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    $('qr-img').innerHTML = ''; // 閉じたら、リンクを画面に残さない
    current = null;
  });
  $('qr-png').addEventListener('click', async () => {
    if (!current) return;
    try {
      await downloadPNG(current.art, `${eventTitle(getState())} 閲覧リンクのQRコード`);
    } catch (e) {
      toast(`画像を保存できませんでした: ${e.message}`, { error: true });
    }
  });
}

