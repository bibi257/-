// 回（第1回・第2回…）の画面。次の回を始める・過去の回を見る（読み取り専用）・過去の回を削除する
//
// 過去の回を見ている間は、共有の閲覧と同じ読み取り専用の仕組みを使う（既存の表・結果・順位表・CSV/PNG 出力がそのまま使える）。
// 見ている間は自動保存しない。やめると、見る前の自分の大会データ（現在の回）へ戻る。
// 共有の閲覧者も、運営が公開した過去の回を見られる（見ている間に届いた最新の内容は控えておき、戻ったときに表示する）。

import { getState, setState, setReadOnly, setRemoteState, reloadLocal } from './store.js';
import { h, toast } from './io.js';
import { isAdmin, isViewer, onShareChange, setRemoteStateHandler } from './share.js';
import {
  currentEdition, startNextEdition, deleteEdition, editionState, editionSummary,
} from '../core/edition.js';
import { resolveBracket, tournamentProgress } from '../core/bracket.js';
import { resolveLeague, leagueProgress } from '../core/league.js';

let real = null; // 過去の回を見ている間の、現在の回を含む大会データ（自分のデータ。共有の閲覧者なら、最新に届いた公開内容）
let viewing = null; // 見ている過去の回の番号
let asViewer = false; // 共有の閲覧者として見ているか

export const isViewingEdition = () => viewing !== null;

/** まだ終わっていない試合の説明（次の回を始める前の確認に出す） */
function unfinishedNotes(st) {
  const notes = [];
  if (st.tournament) {
    const p = tournamentProgress(resolveBracket(st.tournament, st.tables));
    if (p.done < p.total) notes.push(`トーナメントにあと${p.total - p.done}試合`);
  }
  if (st.league) {
    const p = leagueProgress(resolveLeague(st.league, st.tables));
    if (p.done < p.total) notes.push(`総当たりにあと${p.total - p.done}試合`);
  }
  return notes;
}

/** トーナメント・総当たりが終わったときに出す「次の回を始める」ボタン */
export function nextEditionButton() {
  return `<button type="button" class="owner-only" data-edition="next">第${currentEdition(getState()) + 1}回を始める</button>`;
}

/** 参加者・設定タブの「回」のカード */
export function editionsCardHtml(st) {
  const n = currentEdition(st);
  const canStart = !!(st.tournament || st.league);
  const past = [...(st.history ?? [])].reverse();
  return `<div class="card" id="editions-card">
    <h2>回 <span class="muted">今は第${n}回</span></h2>
    <p class="hint">同じ参加者・卓・設定のまま、次の回を始められます。今の表と結果は「過去の回」に残り、あとから見たり、CSV・PNG で出力したりできます。</p>
    <p><button type="button" class="primary" data-edition="next" ${canStart ? '' : 'disabled'}>第${n + 1}回を始める</button>
      ${canStart ? '' : '<span class="hint">表を作成すると始められます</span>'}</p>
    ${past.length ? `<div class="table-wrap"><table class="data editions">
      <thead><tr><th>回</th><th>開催日</th><th>結果</th><th>操作</th></tr></thead>
      <tbody>${past.map((e) => `<tr>
        <td>第${e.edition}回</td><td>${h(e.date || '－')}</td><td>${h(editionSummary(e))}</td>
        <td class="ops"><button type="button" class="small" data-edition-view="${e.edition}">見る</button>
          <button type="button" class="small danger" data-edition-del="${e.edition}">削除</button></td></tr>`).join('')}</tbody>
    </table></div>` : '<p class="muted">過去の回はまだありません。</p>'}
  </div>`;
}

function nextEdition() {
  const st = getState();
  const r = startNextEdition(st);
  if (!r.ok) { toast(r.error, { error: true }); return; }
  const n = currentEdition(st);
  const notes = unfinishedNotes(st);
  const msg = `第${n}回の表と結果を「過去の回」に残して、第${n + 1}回を始めます。\n参加者・卓・設定はそのまま引き継ぎます。` +
    `${notes.length ? `\n\n※まだ終わっていない試合があります（${notes.join('、')}）。` : ''}` +
    `${isAdmin() ? '\n※共有中のため、閲覧者の画面も新しい回の内容に変わります。' : ''}\n\nよろしいですか？`;
  if (!confirm(msg)) return;
  setState(r.state);
  toast(`第${n + 1}回を始めました。参加者を確認して、表を作成してください`);
  window.dispatchEvent(new CustomEvent('app:tab', { detail: 'setup' }));
}

function removeEdition(n) {
  if (!confirm(`第${n}回の記録を削除します。元に戻せません（必要なら先に「保存」でファイルに残してください）。\n\nよろしいですか？`)) return;
  setState(deleteEdition(getState(), n));
  toast(`第${n}回の記録を削除しました`);
}

function renderBanner() {
  const el = document.getElementById('edition-banner');
  const numbers = (list) => list.map((e) => e.edition);
  if (viewing === null) {
    // 共有の閲覧者には、公開された過去の回があるときだけ「過去の回を見る」を出す（運営は「回」のカードから見る）
    const past = isViewer() ? getState().history ?? [] : [];
    if (!past.length) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = `<b>過去の回の結果も見られます</b>
      <label>回を選ぶ <select id="eb-select-past"><option value="">選んでください</option>${numbers(past).reverse().map((n) => `<option value="${n}">第${n}回</option>`).join('')}</select></label>`;
    return;
  }
  const cur = currentEdition(real);
  const options = numbers(real.history).map((n) => `<option value="${n}" ${n === viewing ? 'selected' : ''}>第${n}回</option>`).join('');
  el.hidden = false;
  el.innerHTML = `<b>第${viewing}回の記録を見ています</b>（閲覧専用です。変更はできません）
    <label>他の回 <select id="eb-select">${options}<option value="current">第${cur}回（現在）</option></select></label>
    <button type="button" class="primary" data-edition="back">現在の回（第${cur}回）に戻る</button>`;
}

function viewEdition(n) {
  const src = viewing === null ? getState() : real;
  const view = editionState(src, n);
  if (!view) return;
  if (viewing === null) {
    real = src;
    asViewer = isViewer();
    if (!asViewer) setReadOnly(true); // 共有の閲覧者は、すでに読み取り専用
  }
  viewing = n;
  document.body.classList.add('viewer', 'archive-view');
  window.dispatchEvent(new CustomEvent('app:tab', { detail: view.tournament ? 'tournament' : view.league ? 'league' : 'standings' }));
  setRemoteState(view);
  renderBanner();
}

export function leaveEdition() {
  if (viewing === null) return;
  const latest = real;
  viewing = null;
  real = null;
  document.body.classList.remove('archive-view');
  if (asViewer) {
    // 共有の閲覧者: 見ている間に届いた最新の公開内容に戻る
    if (isViewer()) setRemoteState(latest);
    asViewer = false;
    renderBanner();
    window.dispatchEvent(new CustomEvent('app:tab', { detail: 'tournament' }));
    return;
  }
  document.body.classList.remove('viewer');
  setReadOnly(false);
  reloadLocal();
  renderBanner();
  window.dispatchEvent(new CustomEvent('app:tab', { detail: 'setup' }));
}

/** 共有から届いた最新の内容。過去の回を見ている間は画面を変えず、戻ったときに表示する */
function onRemote(next) {
  if (viewing === null) { setRemoteState(next); renderBanner(); return; }
  real = next;
  if (!next.history.some((e) => e.edition === viewing)) {
    // 見ていた回が、運営によって削除された
    leaveEdition();
    toast('見ていた回は、運営が削除したため閉じました');
    return;
  }
  renderBanner();
}

export function setupEditions() {
  setRemoteStateHandler(onRemote);
  // 閲覧をやめた・共有が終わったときに、バナーと見ていた回の状態を片付ける
  onShareChange(() => {
    if (viewing !== null && asViewer && !isViewer()) {
      viewing = null;
      real = null;
      asViewer = false;
      document.body.classList.remove('archive-view');
    }
    renderBanner();
  });
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const act = t.closest('[data-edition]')?.dataset.edition;
    if (act === 'next') nextEdition();
    else if (act === 'back') leaveEdition();
    const v = t.closest('[data-edition-view]');
    if (v) viewEdition(Number(v.dataset.editionView));
    const d = t.closest('[data-edition-del]');
    if (d) removeEdition(Number(d.dataset.editionDel));
  });
  document.getElementById('edition-banner').addEventListener('change', (e) => {
    if (e.target.id === 'eb-select-past') {
      if (e.target.value) viewEdition(Number(e.target.value));
    } else if (e.target.id === 'eb-select') {
      if (e.target.value === 'current') leaveEdition();
      else viewEdition(Number(e.target.value));
    }
  });
}
