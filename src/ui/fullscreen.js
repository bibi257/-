// 全画面の切り替え（呼び出し画面・QRコード共通）。
// <dialog> 自体は requestFullscreen できない（Chromium は「Dialog elements are invalid」で拒否する）ので、ページ全体（<html>）を全画面にする。
// 開いているダイアログは、その上に表示されたまま残る。

import { toast } from './io.js';

/** 全画面にできる環境か（iPhone の Safari などは、要素の全画面に対応していない） */
export function canFullscreen() {
  return !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;
}

export async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast('全画面にできませんでした。この端末・ブラウザでは使えないことがあります', { error: true });
  }
}

/** 全画面を終える（ダイアログを閉じたときに使う） */
export function leaveFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
