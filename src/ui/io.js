// ダウンロード・PNG 変換・ファイル読み込み・通知

import { FONT_FAMILY } from '../render/svg.js';
import { parseExportSvg } from '../render/svgShapes.js';
import { toCSV } from '../core/csv.js';
import { tableToRows } from '../core/exportData.js';

let canvasCtx = null;

/** canvas で文字幅を測る（SVG の配置計算用。画面のフォント） */
export function measureText(text, size, bold = false) {
  if (!canvasCtx) canvasCtx = document.createElement('canvas').getContext('2d');
  canvasCtx.font = `${bold ? 'bold ' : ''}${size}px ${FONT_FAMILY}`;
  return canvasCtx.measureText(String(text)).width;
}

/** 画面のフォント（IBM Plex Sans JP）の読み込みを待つ。半角の英数字の幅が確定してから表を作るため。全角文字はどのフォントでも1文字=1emなので待たない。最長 1.5 秒 */
export function fontsReady() {
  if (!document.fonts?.load) return Promise.resolve();
  const loads = ['', 'bold '].map((w) => document.fonts.load(`${w}14px "IBM Plex Sans JP"`, 'AaZz09 .:-/'));
  return Promise.race([Promise.allSettled(loads), new Promise((r) => setTimeout(r, 1500))]);
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

/** 使う字を含む分割フォントを読み込ませる。長くても FONT_WAIT_MS で切り上げ、間に合わなければ端末のフォントで描く（PLAN D58） */
const FONT_WAIT_MS = 1000;
function loadFontsFor(fontFamily, sample) {
  if (!document.fonts?.load) return Promise.resolve();
  const loads = ['', 'bold '].map((w) => document.fonts.load(`${w}14px ${fontFamily}`, sample));
  return Promise.race([Promise.allSettled(loads), new Promise((r) => setTimeout(r, FONT_WAIT_MS))]);
}

/** SVG の dominant-baseline="central"（文字の高さの中央）に合わせた、alphabetic の基準線の y */
function centralBaseline(ctx, y) {
  const m = ctx.measureText('M');
  return m.fontBoundingBoxAscent === undefined ? null : y + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
}

/**
 * PNG 用の SVG を PNG の Blob にする（scale 倍の解像度）。SVG を画像として読むと、ページのフォントを使えないため、
 * rect・line・text を読み取って canvas に直接描く。文字は、ページに読み込んだ IBM Plex Sans JP で描かれる
 */
export async function svgToPng(svg, width, height, scale = 2) {
  const { fontFamily, shapes } = parseExportSvg(svg);
  // 同じ字は1回でよい（読み込みの判定が、字の数だけ増えないように）
  await loadFontsFor(fontFamily, [...new Set(shapes.filter((s) => s.type === 'text').map((s) => s.text).join(''))].join(''));
  const canvas = document.createElement('canvas');
  // ブラウザの canvas 上限（約 16000px 角）を超えないよう倍率を下げる
  const s = Math.max(0.5, Math.min(scale, 16000 / width, 16000 / height));
  canvas.width = Math.round(width * s);
  canvas.height = Math.round(height * s);
  const ctx = canvas.getContext('2d');
  ctx.scale(canvas.width / width, canvas.height / height);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  for (const sh of shapes) {
    if (sh.type === 'rect') {
      ctx.beginPath();
      if (sh.rx) ctx.roundRect(sh.x, sh.y, sh.width, sh.height, sh.rx);
      else ctx.rect(sh.x, sh.y, sh.width, sh.height);
      if (sh.fill && sh.fill !== 'none') { ctx.fillStyle = sh.fill; ctx.fill(); }
      if (sh.stroke && sh.stroke !== 'none') { ctx.strokeStyle = sh.stroke; ctx.lineWidth = sh.strokeWidth; ctx.stroke(); }
    } else if (sh.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(sh.x1, sh.y1);
      ctx.lineTo(sh.x2, sh.y2);
      ctx.strokeStyle = sh.stroke;
      ctx.lineWidth = sh.strokeWidth;
      ctx.lineCap = 'square';
      ctx.stroke();
    } else {
      ctx.font = `${sh.bold ? 'bold ' : ''}${sh.size}px ${fontFamily}`;
      ctx.fillStyle = sh.fill;
      ctx.textAlign = sh.anchor === 'middle' ? 'center' : sh.anchor === 'end' ? 'right' : 'left';
      const base = centralBaseline(ctx, sh.y);
      ctx.textBaseline = base === null ? 'middle' : 'alphabetic';
      ctx.fillText(sh.text, sh.x, base ?? sh.y);
    }
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG の作成に失敗しました'))), 'image/png'));
}

/**
 * 文字を含まない SVG（QR コード）を、SVG ごと画像にして PNG の Blob にする。
 * 表の PNG（svgToPng）と違い、フォントも rect・line・text 以外の要素（path）も関係ないので、ブラウザの描画にまかせる
 */
function imageSvgToPng(svg, width, height, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
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

/** 表の PNG を保存する（文字は画面と同じフォント）。QR コードのように文字のない図は、imageOnly: true */
export async function downloadPNG({ svg, width, height }, title, { imageOnly = false } = {}) {
  const blob = await (imageOnly ? imageSvgToPng : svgToPng)(svg, width, height);
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
