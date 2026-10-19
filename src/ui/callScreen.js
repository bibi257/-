// 呼び出し画面（会場のプロジェクター・大型ディスプレイ向けの大きな表示）

import { canFullscreen, toggleFullscreen, leaveFullscreen } from './fullscreen.js';
import { getState } from './store.js';
import { h } from './io.js';
import { callBoard } from '../core/callBoard.js';
import { elapsedMinutes } from '../core/started.js';

const $ = (id) => document.getElementById(id);
let kind = null;

function sizeClass(count) {
  return count <= 2 ? 'cs-xl' : count <= 6 ? 'cs-l' : count <= 12 ? 'cs-m' : 'cs-s';
}

function cardHtml(it) {
  const slot = it.timeSlot > 1 ? `<small>時間帯${it.timeSlot}</small>` : '';
  const run = it.startedAt ? `<span class="cs-run"><span class="badge badge-running">進行中</span> <span class="ni-elapsed" data-started="${h(it.startedAt)}">${elapsedMinutes(it.startedAt)}分</span></span>` : '';
  return `<li class="cs-card${it.startedAt ? ' running' : ''}">
    <div class="cs-card-top"><span class="cs-label">${h(it.label)}</span><span class="cs-no">${run}No.${it.no}</span></div>
    ${it.table || slot ? `<div class="cs-table">${h(it.table)}${slot}</div>` : ''}
    <div class="cs-players"><span>${h(it.p1)}</span><i>vs</i><span>${h(it.p2)}</span></div>
  </li>`;
}

export function renderCallScreen() {
  const b = callBoard(getState(), kind);
  $('cs-title').textContent = b.title;
  $('cs-sub').textContent = b.kind === 'league' ? '総当たり' : 'トーナメント';
  $('cs-progress').textContent = b.total ? `${b.done} / ${b.total} 試合終了` : '';
  const body = $('cs-body');
  body.className = `cs-body ${sizeClass(b.items.length)}`;
  if (b.kind === 'none') {
    body.innerHTML = '<p class="cs-message">表がまだ作成されていません</p>';
  } else if (b.finished) {
    body.innerHTML = `<p class="cs-message">${b.kind === 'league' ? '全試合終了' : '決勝まで終了'}</p>` +
      (b.champion ? `<p class="cs-champion"><small>優勝</small>${h(b.champion)}</p>` : '') +
      (b.runnerUp || b.thirds.length ? `<p class="cs-podium">${b.runnerUp ? `<span><small>準優勝</small>${h(b.runnerUp)}</span>` : ''}${b.thirds.length ? `<span><small>3位</small>${b.thirds.map(h).join('、')}</span>` : ''}</p>` : '');
  } else if (!b.items.length) {
    body.innerHTML = '<p class="cs-message">次に行う試合はありません</p>';
  } else {
    // 進行中の試合と、これから行う試合（次）を分けて出す
    const running = b.items.filter((it) => it.startedAt);
    const next = b.items.filter((it) => !it.startedAt);
    body.innerHTML = (running.length ? `<p class="cs-next cs-running-title">進行中</p><ul class="cs-list cs-running">${running.map(cardHtml).join('')}</ul>` : '') +
      (next.length ? `<p class="cs-next">次に行う試合${b.kind === 'league' && next[0] ? `（${h(next[0].label)}）` : ''}</p><ul class="cs-list">${next.map(cardHtml).join('')}</ul>` : '') +
      (b.rest.length ? `<p class="cs-rest">休み：${h(b.rest.join('、'))}</p>` : '');
  }
}

export function openCallScreen(k) {
  kind = k;
  renderCallScreen();
  const dlg = $('call-screen');
  if (!dlg.open) dlg.showModal();
}

/** 状態が変わったとき（結果入力・共有の更新）に、開いていれば内容を更新する */
export function refreshCallScreen() {
  if ($('call-screen').open) renderCallScreen();
}

export function setupCallScreen() {
  const dlg = $('call-screen');
  const full = $('cs-full');
  full.hidden = !canFullscreen();
  full.addEventListener('click', toggleFullscreen);
  $('cs-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => {
    leaveFullscreen();
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-call]');
    if (b) openCallScreen(b.dataset.call);
  });
}
