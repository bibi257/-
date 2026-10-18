// 総当たりタブ

import { getState, setState } from './store.js';
import { h, toast, measureText, downloadCSV, downloadPNG } from './io.js';
import { openResultDialog } from './resultDialog.js';
import { nextEditionButton } from './editions.js';
import { nextItemHtml } from './callCard.js';
import { exportMenuHtml } from './exportMenu.js';
import { scrollBehavior, flash } from './reveal.js';
import { statusBadge } from './badge.js';
import { resultCardsHtml } from './resultCards.js';
import { resolveLeague, setLeagueResult, setLeagueTable, leagueProgress, outcomeFor } from '../core/league.js';
import { leagueMatrixTable, leagueResultRows, leagueResultsTable } from '../core/exportData.js';
import { tableSvg } from '../render/svg.js';
import { playerName, tableName } from '../core/state.js';
import { assignTable, pickNextMatch } from '../core/result.js';
import { sanitizeFilter, filterRows, countText, STATUS_FILTERS, MAX_NAME_FILTER } from '../core/matchFilter.js';

const panel = () => document.getElementById('panel-league');

// 試合結果一覧の絞り込み。選んだ条件はこの端末の localStorage に残す（使えない環境でも動く）
const FILTER_KEY = 'bukatsu-taikai:league-filter';
let filter = null; // 保存されていた（または選んだ）条件。今選べない値は、使うときに「すべて」へ直す
let filterLoaded = false;

function loadFilter() {
  if (!filterLoaded) {
    filterLoaded = true;
    try { filter = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null'); } catch { filter = null; }
  }
  return filter;
}

function saveFilter() {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(filter)); } catch { /* 保存できなくても絞り込みは使える */ }
}

/** 今の大会で選べる回戦・卓 */
function filterChoices(st, rows) {
  return { rounds: [...new Set(rows.map((r) => r.match.round))], tableIds: st.tables.map((t) => t.id) };
}

/** 一覧（表とカード）の行を、条件に合わないものだけ画面から隠す。全行は DOM に残すので、印刷は全試合になる */
function applyFilter(rows, f) {
  const shown = new Set(filterRows(rows, f).map((r) => r.match.id));
  panel().querySelectorAll('.results-table tr[data-match], .result-cards [data-match]').forEach((el) => {
    el.closest('tr, li').toggleAttribute('data-filtered', !shown.has(el.dataset.match));
  });
  const count = document.getElementById('mf-count');
  if (count) count.textContent = countText(shown.size, rows.length);
  const empty = document.getElementById('mf-empty');
  if (empty) empty.hidden = shown.size > 0;
}

function filterBarHtml(st, rows, f) {
  const { rounds } = filterChoices(st, rows);
  const opt = (value, label, cur) => `<option value="${h(value)}" ${cur === value ? 'selected' : ''}>${h(label)}</option>`;
  return `<div class="match-filter no-print" role="search" aria-label="試合の絞り込み">
      <label>状態 <select id="mf-status">${STATUS_FILTERS.map((x) => opt(x.value, x.label, f.status)).join('')}</select></label>
      <label>回戦 <select id="mf-round">${opt('all', 'すべて', f.round)}${rounds.map((r) => opt(String(r), `${r}回戦`, f.round)).join('')}</select></label>
      <label>卓 <select id="mf-table">${opt('all', 'すべて', f.table)}${st.tables.map((t) => opt(t.id, t.name, f.table)).join('')}</select></label>
      <label class="mf-name">選手名 <input type="text" id="mf-name" value="${h(f.name)}" maxlength="${MAX_NAME_FILTER}" placeholder="名前の一部" autocomplete="off"></label>
      <span class="muted mf-count" id="mf-count" role="status" aria-live="polite"></span>
    </div>
    <div class="mf-empty no-print" id="mf-empty" hidden><p>条件に合う試合はありません</p>
      <button type="button" data-filter-reset>条件を解除</button></div>`;
}

export function renderLeague() {
  const st = getState();
  const l = st.league;
  if (!l) {
    panel().innerHTML = `<div class="card empty-state"><p>総当たり表はまだ作成されていません。</p>
      <button type="button" class="primary" data-goto="setup">参加者・設定へ</button></div>`;
    return;
  }
  const res = resolveLeague(l, st.tables);
  const prog = leagueProgress(res);
  const ids = st.players.map((p) => p.id);
  const changed = l.playerIds.length !== ids.length || l.playerIds.some((id) => !ids.includes(id));
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  const matrix = leagueMatrixTable(st);
  const pairs = new Map();
  for (const m of l.matches) { pairs.set(`${m.p1}|${m.p2}`, m); pairs.set(`${m.p2}|${m.p1}`, m); }
  const n = l.playerIds.length;
  const rows = leagueResultRows(st);
  const f = sanitizeFilter(loadFilter(), filterChoices(st, rows));

  panel().innerHTML = `
  ${changed ? '<div class="notice">参加者が追加・削除されています。反映するには「参加者・設定」で総当たり表を作り直してください。</div>' : ''}
  <div class="card no-print">
    <h2>進行状況</h2>
    <div class="progress">
      <div class="progress-bar" aria-hidden="true"><div style="width:${pct}%"></div></div>
      <span><b>${prog.done}</b> / ${prog.total} 試合終了</span>
      ${prog.nextRound ? `<span class="muted">次は ${prog.nextRound}回戦${res.rest[prog.nextRound - 1].length ? `（休み: ${h(res.rest[prog.nextRound - 1].map((id) => playerName(st, id)).join('、'))}）` : ''}</span>` : `<span class="champion">全試合終了</span> ${nextEditionButton()}`}
      <button type="button" class="small" data-call="league" title="会場の大型ディスプレイ向けに、次に行う試合を大きく表示します">呼び出し画面</button>
    </div>
    ${prog.ready.length ? `<div class="next-list">${prog.ready.map((m) => nextItemHtml(st, m)).join('')}</div>` : ''}
  </div>
  <div class="card">
    <h2>総当たり表 <span class="hint"><span class="owner-only">マスをクリックすると結果を入力できます</span>（行の選手から見た結果）</span></h2>
    <div class="toolbar no-print">${exportMenuHtml([
      { label: '総当たり表', csv: 'matrix-csv', png: 'matrix-png' },
      { label: '試合結果', csv: 'results-csv', png: 'results-png' },
    ])}</div>
    <div class="table-wrap">
      <table class="data matrix">
        <thead><tr>${matrix.headers.map((x) => `<th>${h(x)}</th>`).join('')}</tr></thead>
        <tbody>${matrix.rows.map((row, i) => {
          const id = l.playerIds[i];
          return `<tr><th class="rowhead">${h(row[0])}</th>${l.playerIds.map((op, j) => {
            if (op === id) return '<td class="self">－</td>';
            const m = pairs.get(`${id}|${op}`);
            const o = outcomeFor(m, l.results[m.id], id) || 'pending';
            return `<td class="cell ${o}" data-match="${h(m.id)}" title="${h(playerName(st, id))} vs ${h(playerName(st, op))}">${h(row[j + 1])}</td>`;
          }).join('')}${row.slice(n + 1).map((c) => `<td>${h(c)}</td>`).join('')}</tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  </div>
  <div class="card">
    <h2>試合結果一覧</h2>
    ${filterBarHtml(st, rows, f)}
    <div class="table-wrap results-table">
      <table class="data results">
        <thead><tr>${['試合番号', '回戦', '卓', '時間帯', '選手1', 'スコア', '選手2', '結果', '状態'].map((x) => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(({ match: m, cells }) => `<tr class="st-${m.status} clickable" data-match="${h(m.id)}">
          ${cells.map((c, i) => i === 8 ? `<td>${statusBadge(m.status)}</td>` : `<td${[0, 3, 5].includes(i) ? ' class="num"' : ''}>${h(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
    ${resultCardsHtml(rows)}
  </div>`;
  applyFilter(rows, f);
}

function openNext(afterNo) {
  const st = getState();
  if (!st.league) return;
  const next = pickNextMatch(leagueProgress(resolveLeague(st.league, st.tables)).ready, afterNo);
  if (next) openMatch(next.id);
  else toast('次に行う試合はありません');
}

/** 保存した試合を、画面の中で強調する（総当たり表のマス・一覧の行・カード）。
 *  開いた場所（region）から離れないよう、その場所では見えていれば動かさない。「次に行う試合」から開いたときは、総当たり表のマスまで移る */
function revealSaved(id, region) {
  const mine = (sel) => [...panel().querySelectorAll(sel)].filter((x) => x.dataset.match === id);
  const cells = mine('.matrix td[data-match]');
  const list = [...mine('.results-table tr[data-match]'), ...mine('.result-cards [data-match]')].filter((x) => x.getClientRects().length > 0);
  const target = region === 'list' ? list[0] ?? cells[0] : cells[0];
  target?.scrollIntoView({ block: region === 'next' ? 'center' : 'nearest', inline: 'nearest', behavior: scrollBehavior() });
  for (const el of [...cells, ...list]) flash(el);
}

function openMatch(id, region = 'next') {
  const st = getState();
  const l = st.league;
  const res = resolveLeague(l, st.tables);
  const m = res.matches.find((x) => x.id === id);
  if (!m) return;
  const seq = res.matches.filter((x) => x.round === m.round).indexOf(m);
  const auto = assignTable(seq, st.tables, null);
  openResultDialog({
    title: `総当たり ${m.round}回戦　試合 No.${m.no}`,
    sub: `${m.tableId ? tableName(st, m.tableId) : ''}${m.timeSlot ? `・時間帯 ${m.timeSlot}` : ''}`,
    p1Name: playerName(st, m.p1),
    p2Name: playerName(st, m.p2),
    result: m.result,
    allowDraw: st.settings.league.allowDraw,
    editable: true,
    tables: st.tables,
    tableOverride: l.tableOverrides?.[id] ?? null,
    autoTableName: tableName(st, auto.tableId),
    openNext: () => openNext(m.no),
    onSave(input, tableId, { tableOnly }) {
      let next = setLeagueTable(l, id, tableId);
      if (!tableOnly) {
        const out = setLeagueResult(next, id, input, { allowDraw: st.settings.league.allowDraw });
        if (!out.ok) return out.error;
        next = out.league;
      }
      setState({ ...getState(), league: next });
      toast(tableOnly ? '卓を変更しました' : input ? '結果を保存しました' : '結果を取り消しました');
      revealSaved(id, region); // 保存したあとも、その試合の位置を見せる
      return null;
    },
  });
}

async function onExport(kind) {
  const st = getState();
  try {
    if (kind === 'matrix-csv') downloadCSV(leagueMatrixTable(st));
    else if (kind === 'results-csv') downloadCSV(leagueResultsTable(st));
    else if (kind === 'matrix-png' || kind === 'results-png') {
      const table = kind === 'matrix-png' ? leagueMatrixTable(st) : leagueResultsTable(st);
      await downloadPNG(tableSvg(st, table, { measure: measureText }), table.title);
    } else if (kind === 'print') window.print();
  } catch (e) {
    toast(`出力に失敗しました: ${e.message}`, { error: true });
  }
}

/** 絞り込みの欄を操作したとき。画面は作り直さず（入力中の文字を保つため）、行の表示だけ切り替える */
function onFilterChange() {
  const st = getState();
  if (!st.league) return;
  const val = (id) => document.getElementById(id).value;
  filter = { status: val('mf-status'), round: val('mf-round'), table: val('mf-table'), name: val('mf-name') };
  saveFilter();
  const rows = leagueResultRows(st);
  applyFilter(rows, sanitizeFilter(filter, filterChoices(st, rows)));
}

function resetFilter() {
  filter = null;
  saveFilter();
  renderLeague();
}

export function setupLeagueView() {
  const p = panel();
  p.addEventListener('input', (e) => { if (e.target.closest('.match-filter')) onFilterChange(); });
  p.addEventListener('change', (e) => { if (e.target.closest('.match-filter')) onFilterChange(); });
  p.addEventListener('click', (e) => {
    if (e.target.closest('[data-filter-reset]')) { resetFilter(); return; }
    const c = e.target.closest('[data-match]');
    if (c) { openMatch(c.dataset.match, c.closest('.matrix') ? 'matrix' : c.closest('.results-table, .result-cards') ? 'list' : 'next'); return; }
    const ex = e.target.closest('[data-export]');
    if (ex) onExport(ex.dataset.export);
  });
}
