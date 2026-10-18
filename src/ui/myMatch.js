// 「自分の試合」: 名前を選ぶと、上部に「あなたの次の試合」が出て、表・一覧のその選手が強調される。
// 共有の閲覧者は最初から使える。運営の画面には同じ機能があるが、最初はオフ（押すとオン）。
// 選んだ名前（と、運営のオン・オフ）は、この端末の localStorage に残す。読み書きは try/catch で囲み、使えなくても動く。

import { getState } from './store.js';
import { h } from './io.js';
import { isViewer } from './share.js';
import { playerSummaries, pickPlayerByName, resolveSaved } from '../core/myMatch.js';

const KEY = 'bukatsu-taikai:my-player';
let saved = null; // {id, name}
let on = false; // 運営の画面でオンにしているか（閲覧者は常にオン）
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object') {
      if (typeof v.id === 'string' && typeof v.name === 'string') saved = { id: v.id, name: v.name };
      on = v.on === true;
    }
  } catch { /* 使えなくても動く */ }
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ ...(saved ?? {}), on })); } catch { /* 保存できなくても使える */ }
}

const panel = () => document.getElementById('my-panel');
const enabled = () => isViewer() || on;

/** 画面の中の、選んだ選手の名前を強調する（data-pid を持つ要素に .mine を付ける） */
export function applyMine(id) {
  document.querySelectorAll('[data-pid]').forEach((el) => el.classList.toggle('mine', !!id && el.dataset.pid === id));
}

function slotText(s) {
  return `${h(s.table) || '卓は未定'}${s.timeSlot > 1 ? `<small>時間帯${s.timeSlot}</small>` : ''}`;
}

function cardHtml(s, many) {
  const kind = s.kind === 'league' ? '総当たり' : 'トーナメント';
  const title = `あなたの次の試合${many ? `（${kind}）` : ''}`;
  if (s.state === 'next') {
    return `<section class="card my-card" aria-label="${h(title)}"><h3>${h(title)}</h3>
      <div class="my-main"><span class="my-table">${slotText(s)}</span>
        <span class="my-body"><span class="my-no">No.${s.no}　${h(s.label)}</span>
          <span class="my-opp">対戦相手　<b>${h(s.opponent)}</b></span></span></div>
      ${s.nowRound ? '' : `<p class="hint">今の回戦はお休みです。次の出番は${h(s.label)}です</p>`}</section>`;
  }
  if (s.state === 'waiting') {
    return `<section class="card my-card" aria-label="${h(title)}"><h3>${h(title)}</h3>
      <p class="my-note">次の試合は未定です（${h(s.label)}・対戦者が決まるのを待っています）</p></section>`;
  }
  const result = [s.record && `成績：${s.record}`, s.standing].filter(Boolean).join('・');
  return `<section class="card my-card" aria-label="${h(title)}"><h3>あなたの試合（${h(kind)}）</h3>
    <p class="my-note">全試合が終わりました${result ? `（${h(result)}）` : ''}</p></section>`;
}

function cardsHtml(st, id) {
  if (!id) return '<p class="hint my-hint">名前を入力して選ぶと、あなたの次の試合が出ます。表の中のあなたの名前も強調されます。</p>';
  const list = playerSummaries(st, id);
  if (!list.length) return `<p class="my-note">この大会の表に、${h(st.players.find((p) => p.id === id)?.name ?? '')} さんの名前がありません</p>`;
  return list.map((s) => cardHtml(s, list.length > 1)).join('');
}

/** 画面を描くたびに呼ぶ。入力欄は、名簿や設定が変わったときだけ作り直す（入力中の文字を保つため） */
export function renderMyPanel() {
  load();
  const el = panel();
  const st = getState();
  const hidden = (!st.tournament && !st.league) || !st.players.length || document.body.classList.contains('archive-view');
  if (hidden) { el.hidden = true; el.innerHTML = ''; el.dataset.sig = ''; applyMine(null); return; }
  el.hidden = false;
  const id = resolveSaved(st.players, saved);
  const sig = `${enabled()}|${isViewer()}|${st.players.map((p) => `${p.id}:${p.name}`).join(',')}`;
  if (el.dataset.sig !== sig) {
    el.dataset.sig = sig;
    if (!enabled()) {
      el.innerHTML = '<button type="button" class="small" data-my-toggle="on">自分の試合を探す</button>';
    } else {
      el.innerHTML = `<div class="my-bar"><label for="my-name">あなたの名前</label>
        <input type="text" id="my-name" list="my-names" placeholder="名前を入力して選ぶ" autocomplete="off" maxlength="40" value="${h(st.players.find((p) => p.id === id)?.name ?? '')}">
        <datalist id="my-names">${st.players.map((p) => `<option value="${h(p.name)}"></option>`).join('')}</datalist>
        <button type="button" class="small" data-my-clear>解除</button>
        ${isViewer() ? '' : '<button type="button" class="small" data-my-toggle="off">この機能を使わない</button>'}</div>
        <div id="my-cards" aria-live="polite"></div>`;
    }
  }
  const cards = document.getElementById('my-cards');
  if (cards) cards.innerHTML = cardsHtml(st, id);
  applyMine(enabled() ? id : null);
}

function select(id) {
  const st = getState();
  if (id === resolveSaved(st.players, saved)) return; // 変わっていなければ、書き込みも描き直しもしない（1文字ごとの入力で重くならないように）
  saved = id ? { id, name: st.players.find((p) => p.id === id)?.name ?? '' } : null;
  persist();
  const cards = document.getElementById('my-cards');
  if (cards) cards.innerHTML = cardsHtml(st, id);
  applyMine(id);
}

export function setupMyMatch() {
  const el = panel();
  el.addEventListener('input', (e) => {
    if (e.target.id !== 'my-name') return;
    select(pickPlayerByName(getState().players, e.target.value)); // ちょうど一致する人がいなければ外す（入力欄と強調がずれないように）
  });
  el.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    if (t.closest('[data-my-clear]')) {
      const input = document.getElementById('my-name');
      if (input) { input.value = ''; input.focus(); }
      select(null);
      return;
    }
    const toggle = t.closest('[data-my-toggle]');
    if (toggle) {
      on = toggle.dataset.myToggle === 'on';
      persist();
      renderMyPanel();
    }
  });
}
