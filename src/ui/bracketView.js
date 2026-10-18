// トーナメント表（SVG）の表示操作: 全体表示・拡大縮小・回戦への移動・試合の位置までのスクロールと強調。
// 拡大率は SVG の表示上の width/height を変えて実現する（CSS 変数 --bw・--bh・--bz → web/style.css）。属性（元の大きさ）は変えないので、印刷は今までどおり。

import { scrollBehavior, flash } from './reveal.js';

export const ZOOM_STEPS = [50, 75, 100, 125, 150];

/**
 * 拡大率を1段階変える。
 * @param {number} pct 今の拡大率（%）。全体表示のときは、そのときの実際の拡大率
 * @param {'in'|'out'} dir
 */
export function stepZoom(pct, dir) {
  if (dir === 'in') return ZOOM_STEPS.find((s) => s > pct + 0.5) ?? ZOOM_STEPS.at(-1);
  return [...ZOOM_STEPS].reverse().find((s) => s < pct - 0.5) ?? ZOOM_STEPS[0];
}

/** 操作バー。回戦の名前の列（優勝を含む）ごとに移動ボタンを出す */
export function controlsHtml(columnNames) {
  return `<div class="bracket-controls no-print" role="group" aria-label="トーナメント表の表示">
    <button type="button" class="small" data-zoom="fit" aria-pressed="false" title="表の全体が枠の幅に収まるように縮小します">全体表示</button>
    <button type="button" class="small icon" data-zoom="out" aria-label="縮小" title="縮小（50%まで）">－</button>
    <span class="zoom-level" id="zoom-level" aria-live="polite">100%</span>
    <button type="button" class="small icon" data-zoom="in" aria-label="拡大" title="拡大（150%まで）">＋</button>
    <span class="group-label">回戦へ移動</span>
    ${columnNames.map((n, k) => `<button type="button" class="small" data-col="${k}">${n}</button>`).join('')}
  </div>`;
}

const state = { mode: 'pct', pct: 100 }; // mode: 'fit'（全体表示）| 'pct'（拡大率を指定）

// スマホ幅（700px 以下）の表示: 'rounds'（回戦ごと。初期表示）| 'table'（今の SVG の表）。PC 幅は常に表
const MOBILE = '(max-width: 700px)';
const view = { mode: 'rounds', round: null };
let refreshRounds = () => {};

export const getRoundSel = () => view.round;
export const roundsActive = () => window.matchMedia(MOBILE).matches && view.mode === 'rounds';

/** 回戦ごと／表の切り替え（スマホ幅だけ） */
export function viewSwitchHtml() {
  return `<div class="view-switch no-print" role="group" aria-label="表示の切り替え">
    <button type="button" class="small" data-view-mode="rounds" aria-pressed="${view.mode === 'rounds'}">回戦ごと</button>
    <button type="button" class="small" data-view-mode="table" aria-pressed="${view.mode === 'table'}">表で見る</button>
  </div>`;
}

/** 今の表示（data-view）を、操作の入るカードに付ける */
export function viewMode() {
  return view.mode;
}

const behavior = scrollBehavior;

function natural(wrap) {
  const svg = wrap.querySelector('svg');
  return svg ? { svg, w: Number(svg.getAttribute('width')), h: Number(svg.getAttribute('height')) } : null;
}

/** 今の実際の拡大率（1 = 100%） */
function currentScale(wrap) {
  const n = natural(wrap);
  if (!n) return 1;
  if (state.mode === 'fit') return wrap.clientWidth > 0 ? Math.min(1, wrap.clientWidth / n.w) : 1;
  return state.pct / 100;
}

/** 表の大きさと、操作バーの表示（拡大率・全体表示の押された状態・拡大縮小の限度）を今の状態に合わせる */
export function applyZoom(wrap) {
  const n = natural(wrap);
  if (!n) return;
  const s = currentScale(wrap);
  // 画面の CSS（@media screen）が、元の大きさ × 拡大率で width/height を決める。印刷は元の属性のまま
  n.svg.style.setProperty('--bw', String(n.w));
  n.svg.style.setProperty('--bh', String(n.h));
  n.svg.style.setProperty('--bz', String(s));
  const pct = Math.round(s * 100);
  const card = wrap.closest('.card') || document;
  const level = card.querySelector('#zoom-level');
  if (level) level.textContent = state.mode === 'fit' ? `全体 ${pct}%` : `${pct}%`;
  card.querySelector('[data-zoom=fit]')?.setAttribute('aria-pressed', String(state.mode === 'fit'));
  const out = card.querySelector('[data-zoom=out]');
  const inn = card.querySelector('[data-zoom=in]');
  if (out) out.disabled = pct <= ZOOM_STEPS[0];
  if (inn) inn.disabled = pct >= ZOOM_STEPS.at(-1);
}

/** 描画のたびに呼ぶ。全体表示のときは、枠の幅が変わったら（タブを開いた・画面を回したなど）自動で合わせ直す */
export function setupWrap(wrap) {
  applyZoom(wrap);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (state.mode === 'fit') applyZoom(wrap); }).observe(wrap);
}

function scrollToColumn(wrap, k) {
  const cols = (wrap.dataset.cols || '').split(',').map(Number);
  if (!Number.isFinite(cols[k])) return;
  wrap.scrollTo({ left: Math.max(0, cols[k] * currentScale(wrap) - 12), behavior: behavior() });
}

/** その試合がある位置までスクロールし、枠を1.5秒強調する（動きを減らす設定のときは、すぐに移動する）。
 *  スマホ幅の「回戦ごと」表示では、その回戦のタブを開いて、カードを強調する。roundKey は試合の回戦（'1'…、3位決定戦は 'third'） */
export function revealMatch(id, roundKey) {
  if (roundsActive()) {
    if (roundKey !== undefined) { view.round = String(roundKey); refreshRounds(); }
    const card = [...document.querySelectorAll('#round-view [data-match]')].find((x) => x.dataset.match === id);
    if (!card) return;
    card.scrollIntoView({ block: 'center', inline: 'nearest', behavior: behavior() });
    flash(card);
    return;
  }
  const wrap = document.getElementById('bracket-wrap');
  const g = wrap && [...wrap.querySelectorAll('g.match')].find((x) => x.dataset.id === id);
  if (!g) return;
  g.scrollIntoView({ block: 'center', inline: 'center', behavior: behavior() });
  flash(g);
}

/**
 * @param {HTMLElement} panel トーナメントタブ
 * @param {{refreshRounds:() => void}} hooks 回戦ごとの表示を、今の状態から描き直す関数（tournamentView が渡す）
 */
export function setupBracketControls(panel, hooks = {}) {
  refreshRounds = hooks.refreshRounds || (() => {});
  panel.addEventListener('click', (e) => {
    const sw = e.target.closest('[data-view-mode]');
    if (sw) {
      view.mode = sw.dataset.viewMode;
      const card = sw.closest('.bracket-card');
      if (card) card.dataset.view = view.mode;
      card?.querySelectorAll('[data-view-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.viewMode === view.mode)));
      const wrap = document.getElementById('bracket-wrap');
      if (view.mode === 'table' && wrap) applyZoom(wrap);
      else refreshRounds();
      return;
    }
    const tab = e.target.closest('[data-round-tab]');
    if (tab) { view.round = tab.dataset.roundTab; refreshRounds(); return; }
    const z = e.target.closest('[data-zoom]');
    const c = e.target.closest('[data-col]');
    const wrap = document.getElementById('bracket-wrap');
    if (!wrap) return;
    if (z) {
      if (z.dataset.zoom === 'fit') state.mode = 'fit';
      else {
        state.pct = stepZoom(Math.round(currentScale(wrap) * 100), z.dataset.zoom);
        state.mode = 'pct';
      }
      applyZoom(wrap);
    } else if (c) scrollToColumn(wrap, Number(c.dataset.col));
  });
}
