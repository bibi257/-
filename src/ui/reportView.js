// 試合結果の報告（コメントタブの上部）。閲覧者は結果を報告でき、運営は承認待ちの報告を承認・却下する。
// 報告は運営が承認するまで表に反映されない。フォームは一度だけ作り、入力中の内容を消さない。

import { getState, setState } from './store.js';
import { h, toast } from './io.js';
import { S, isAdmin, isViewer, postReport, deleteReport, getCommentName, setCommentName } from './share.js';
import { NAME_MAX, formatCommentTime, targetLabel } from '../core/share.js';
import { reportTargets, checkReport, reportText, reportStatus, applyReport } from '../core/report.js';

const area = () => document.getElementById('report-area');
const $ = (id) => document.getElementById(id);

function formHtml() {
  return `<div class="card report-card">
    <h2>試合結果を報告</h2>
    <p class="hint">終わった試合の結果を運営に知らせます。運営が確認して承認すると、表に反映されます。</p>
    <form id="report-form" class="report-form" novalidate>
      <label class="sh-field"><span>試合</span><select id="rf-match"></select></label>
      <div id="rf-sides" class="rf-sides"></div>
      <label class="sh-field"><span>名前（空欄なら「名無し」）</span><input id="rf-name" maxlength="${NAME_MAX}" autocomplete="nickname" value="${h(getCommentName())}"></label>
      <div class="cf-foot"><span class="error" id="rf-error" role="alert"></span><button type="submit" class="primary">運営に報告する</button></div>
    </form>
  </div>`;
}

/** 選んだ試合に合わせて、勝者とスコアの欄を作り直す（試合が変わらないときは触らない） */
function updateSides(targets) {
  const sel = $('rf-match');
  const t = targets.find((x) => x.id === sel.value);
  const box = $('rf-sides');
  const key = t ? `${t.id}:${t.p1}:${t.p2}:${t.allowDraw}` : '';
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  if (!t) { box.innerHTML = ''; return; }
  const a = t.p1Name;
  const b = t.p2Name;
  box.innerHTML = `
    <div class="rf-side"><label class="rf-pick"><input type="radio" name="rf-outcome" value="p1"><span class="rf-name">${h(a)}</span></label>
      <input class="rf-score" id="rf-s1" inputmode="numeric" autocomplete="off" aria-label="${h(a)}のスコア"></div>
    <div class="rf-side"><label class="rf-pick"><input type="radio" name="rf-outcome" value="p2"><span class="rf-name">${h(b)}</span></label>
      <input class="rf-score" id="rf-s2" inputmode="numeric" autocomplete="off" aria-label="${h(b)}のスコア"></div>
    ${t.allowDraw ? '<label class="rf-draw"><input type="radio" name="rf-outcome" value="draw"> 引き分け</label>' : ''}
    <p class="hint">勝った方を選びます。スコアは分かれば入れてください（スコアだけでも構いません）。</p>`;
}

function updateForm() {
  const targets = reportTargets(getState());
  const sel = $('rf-match');
  const prev = sel.value;
  const groups = new Map();
  for (const t of targets) {
    if (!groups.has(t.group)) groups.set(t.group, []);
    groups.get(t.group).push(t);
  }
  sel.innerHTML = targets.length
    ? [...groups].map(([g, list]) => `<optgroup label="${h(g)}">${list.map((t) => `<option value="${h(t.id)}">${h(t.label)}</option>`).join('')}</optgroup>`).join('')
    : '<option value="">報告できる試合がありません</option>';
  if (targets.some((t) => t.id === prev)) sel.value = prev;
  updateSides(targets);
  document.querySelector('#report-form button[type=submit]').disabled = !targets.length;
}

function pendingHtml() {
  const st = getState();
  const items = S.reports.map((r) => {
    const status = reportStatus(st, r);
    return `<li class="report" data-id="${h(r.id)}">
      <div class="c-head"><b>${h(r.name)}</b><span class="c-target">${h(targetLabel(st, r.matchId))}</span><time>${h(formatCommentTime(r.at))}</time></div>
      <p class="report-text">${h(reportText(st, r))}</p>
      ${status.ok ? '' : `<p class="error report-stale">${h(status.error)}</p>`}
      <div class="report-actions">
        ${status.ok ? `<button type="button" class="primary small" data-approve="${h(r.id)}">承認して表に反映</button>` : ''}
        <button type="button" class="small" data-reject="${h(r.id)}">${status.ok ? '却下' : '削除'}</button></div></li>`;
  });
  return `<div class="card report-card"><h2>結果の報告 <span class="hint">承認待ち ${S.reports.length}件</span></h2>
    <p class="hint">閲覧者から届いた結果です。承認すると、運営が結果を入力したときと同じように表に反映されます。</p>
    <ul class="comment-list report-list">${items.join('')}</ul></div>`;
}

/** コメントタブを描画するたびに呼ぶ。運営: 承認待ちの一覧。閲覧者: 報告フォーム */
export function renderReports() {
  const el = area();
  if (!el) return;
  if (isAdmin()) {
    el.innerHTML = S.reports.length ? pendingHtml() : '';
    delete el.dataset.form;
    return;
  }
  if (!isViewer()) { el.innerHTML = ''; delete el.dataset.form; return; }
  if (el.dataset.form !== '1') {
    el.innerHTML = formHtml();
    el.dataset.form = '1';
  }
  updateForm();
}

async function onSubmit(e) {
  e.preventDefault();
  const err = $('rf-error');
  err.textContent = '';
  const outcome = document.querySelector('#report-form input[name="rf-outcome"]:checked')?.value || null;
  const checked = checkReport(getState(), { matchId: $('rf-match').value, outcome, score1: $('rf-s1')?.value, score2: $('rf-s2')?.value });
  if (!checked.ok) { err.textContent = checked.error; return; }
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    await postReport({ name: $('rf-name').value, ...checked.report });
    setCommentName($('rf-name').value.trim());
    $('rf-sides').dataset.key = '';
    $('rf-match').dispatchEvent(new Event('change'));
    toast('運営に報告しました。承認されると表に反映されます');
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false;
  }
}

async function onApprove(id) {
  const rep = S.reports.find((r) => String(r.id) === String(id));
  if (!rep) return;
  const out = applyReport(getState(), rep);
  if (!out.ok) { toast(out.error, { error: true }); return; }
  setState(out.state);
  try {
    await deleteReport(rep.id);
    toast(`報告を承認しました${out.settled ? `（欠席の人の試合${out.settled}件を不戦にしました）` : ''}`);
  } catch (ex) {
    // 表には反映済み。報告の削除だけ失敗したので、一覧に残る（「削除」で片付けられる）
    toast(`結果は反映しましたが、報告を片付けられませんでした: ${ex.message}`, { error: true });
  }
}

export function setupReportView() {
  const el = document.getElementById('panel-comments'); // 欄はコメントタブを作るときに入るので、タブ全体で受ける
  el.addEventListener('submit', (e) => { if (e.target.id === 'report-form') onSubmit(e); });
  el.addEventListener('change', (e) => {
    if (e.target.id === 'rf-match') updateSides(reportTargets(getState()));
  });
  el.addEventListener('input', (e) => {
    // スコアを入れたら、大きい方を勝者として選ぶ（結果の入力ダイアログと同じ）
    if (e.target.id !== 'rf-s1' && e.target.id !== 'rf-s2') return;
    const a = $('rf-s1').value.trim();
    const b = $('rf-s2').value.trim();
    if (!/^\d+$/.test(a) || !/^\d+$/.test(b) || Number(a) === Number(b)) return;
    const pick = document.querySelector(`#report-form input[name="rf-outcome"][value="${Number(a) > Number(b) ? 'p1' : 'p2'}"]`);
    if (pick) pick.checked = true;
  });
  el.addEventListener('click', async (e) => {
    const approve = e.target.closest('[data-approve]')?.dataset.approve;
    const reject = e.target.closest('[data-reject]')?.dataset.reject;
    if (approve) {
      e.target.closest('button').disabled = true;
      await onApprove(approve);
    } else if (reject) {
      if (!confirm('この報告を却下（削除）しますか？表は変わりません。')) return;
      try {
        await deleteReport(reject);
      } catch (ex) {
        toast(ex.message, { error: true });
      }
    }
  });
}
