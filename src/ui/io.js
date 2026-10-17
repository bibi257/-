// ダウンロード・PNG 変換・ファイル読み込み・通知

import { FONT_FAMILY } from '../render/svg.js';
import { toCSV } from '../core/csv.js';
import { tableToRows } from '../core/exportData.js';

let canvasCtx = null;
/** canvas で文字幅を測る（SVG の配置計算用） */
export function measureText(text, size, bold = false) {
  if (!canvasCtx) canvasCtx = document.createElement('canvas').getContext('2d');
  canvasCtx.font = `${bold ? 'bold ' : ''}${size}px ${FONT_FAMILY}`;
  return canvasCtx.measureText(String(text)).width;
}

export function safeFileName(s) {
  return String(s).replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'download';
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // すぐに消すとブラウザによってはダウンロードが始まらないため、少し待ってから片付ける
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 30000);
}

export function downloadCSV(table) {
  const blob = new Blob([toCSV(tableToRows(table))], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${safeFileName(table.title)}.csv`);
}

/** SVG 文字列を PNG の Blob にする（scale 倍の解像度） */
export function svgToPng(svg, width, height, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // ブラウザの canvas 上限（約 16000px 角）を超えないよう倍率を下げる
      const s = Math.max(0.5, Math.min(scale, 16000 / width, 16000 / height));
      canvas.width = Math.round(width * s);
      canvas.height = Math.round(height * s);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG の作成に失敗しました'))), 'image/png');
    };
    img.onerror = () => reject(new Error('画像の作成に失敗しました'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export async function downloadPNG({ svg, width, height }, title) {
  const blob = await svgToPng(svg, width, height);
  downloadBlob(blob, `${safeFileName(title)}.png`);
}

export function readFileBytes(file) {
  return file.arrayBuffer().then((b) => new Uint8Array(b));
}

let toastTimer = null;
export function toast(msg, { error = false } = {}) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), error ? 5000 : 2500);
}

export function h(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
