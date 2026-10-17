// 試合結果の入力ダイアログ（トーナメント・総当たり共通）

import { h } from './io.js';

const $ = (id) => document.getElementById(id);
let current = null;

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} o.sub
 * @param {string} o.p1Name
 * @param {string} o.p2Name
 * @param {object|null} o.result 既存の結果 {outcome, score1, score2, walkover}
 * @param {boolean} o.allowDraw
 * @param {boolean} o.editable 結果を入力できるか（false なら卓の変更のみ）
 * @param {string} o.notice editable=false のときの説明
 * @param {{id:string,name:string}[]} o.tables
 * @param {string|null} o.tableOverride
 * @param {string} o.autoTableName
 * @param {(input:object|null, tableId:string|null, opts:{tableOnly:boolean}) => string|null} o.onSave 失敗時はエラー文を返す
 */
export function openResultDialog(o) {
  current = o;
  $('rd-title').textContent = o.title;
  $('rd-sub').textContent = o.sub;
  $('rd-p1').textContent = o.p1Name;
  $('rd-p2').textContent = o.p2Name;
  const r = o.result;
  $('rd-s1').value = r && r.score1 !== null && r.score1 !== undefined ? r.score1 : '';
  $('rd-s2').value = r && r.score2 !== null && r.score2 !== undefined ? r.score2 : '';
  document.querySelectorAll('#result-form input[name="outcome"]').forEach((el) => {
    el.checked = !!r && el.value === r.outcome;
    el.disabled = !o.editable;
  });
  $('rd-walkover').checked = !!r?.walkover;
  $('rd-draw-wrap').hidden = !o.allowDraw;
  for (const id of ['rd-s1', 'rd-s2', 'rd-walkover']) $(id).disabled = !o.editable;
  $('rd-clear').hidden = !r;
  $('rd-table').innerHTML = `<option value="">自動（${h(o.autoTableName || '－')}）</option>` +
    o.tables.map((t) => `<option value="${h(t.id)}" ${o.tableOverride === t.id ? 'selected' : ''}>${h(t.name)}</option>`).join('');
  $('rd-error').textContent = o.editable ? '' : o.notice || '';
  updateWalkover();
  $('result-dialog').showModal();
  (o.editable ? $('rd-s1') : $('rd-table')).focus();
}

function selectedOutcome() {
  return document.querySelector('#result-form input[name="outcome"]:checked')?.value || null;
}

function updateWalkover() {
  const wo = $('rd-walkover').checked;
  for (const id of ['rd-s1', 'rd-s2']) $(id).disabled = wo || !current?.editable;
  const draw = document.querySelector('#result-form input[value="draw"]');
  if (wo && draw.checked) draw.checked = false;
  draw.disabled = wo || !current?.editable;
}

function autoPick() {
  const toNum = (v) => Number(String(v).trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
  const a = $('rd-s1').value.trim();
  const b = $('rd-s2').value.trim();
  if (a === '' || b === '') return;
  const x = toNum(a);
  const y = toNum(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return;
  const v = x > y ? 'p1' : x < y ? 'p2' : current?.allowDraw ? 'draw' : null;
  document.querySelectorAll('#result-form input[name="outcome"]').forEach((el) => { el.checked = el.value === v; });
}

function save() {
  const o = current;
  const tableId = $('rd-table').value || null;
  const input = { score1: $('rd-s1').value, score2: $('rd-s2').value, outcome: selectedOutcome(), walkover: $('rd-walkover').checked };
  const blank = !input.walkover && !input.outcome && input.score1.trim() === '' && input.score2.trim() === '';
  if (!o.editable || blank) {
    if (o.editable && o.result) {
      $('rd-error').textContent = '結果を消す場合は「結果を取り消す」を押してください';
      return;
    }
    const err = o.onSave(null, tableId, { tableOnly: true });
    if (err) { $('rd-error').textContent = err; return; }
    $('result-dialog').close();
    return;
  }
  const err = o.onSave(input, tableId, { tableOnly: false });
  if (err) { $('rd-error').textContent = err; return; }
  $('result-dialog').close();
}

export function setupResultDialog() {
  $('result-form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
  $('rd-cancel').addEventListener('click', () => $('result-dialog').close());
  $('rd-clear').addEventListener('click', () => {
    if (!confirm('この試合の結果を取り消しますか？')) return;
    const err = current.onSave(null, $('rd-table').value || null, { tableOnly: false });
    if (err) { $('rd-error').textContent = err; return; }
    $('result-dialog').close();
  });
  $('rd-walkover').addEventListener('change', updateWalkover);
  $('rd-s1').addEventListener('input', autoPick);
  $('rd-s2').addEventListener('input', autoPick);
}
