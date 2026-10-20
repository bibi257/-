// 総当たりタブ

import { getState, setState } from './store.js';
import { emptyGuideHtml } from './emptyGuide.js';
import { h, toast, pngOptions, downloadCSV, downloadPNG } from './io.js';
import { openResultDialog } from './resultDialog.js';
import { nextEditionButton } from './editions.js';
import { exportMenuHtml } from './exportMenu.js';
import { tableBoardHtml } from './tableBoardView.js';
import { setupStartButtons, changeStart } from './startMatch.js';
import { scrollBehavior, flash } from './reveal.js';
import { statusBadge, matchStatusKey, nameHtml } from './badge.js';
import { resultCardsHtml } from './resultCards.js';
import { roundPanelHtml, pickKey } from './roundView.js';
import { foldHtml, syncFold, setupFold, isMobile } from './resultsFold.js';
import { getMyPlayerId } from './myMatch.js';
import { resolveLeague, setLeagueResult, setLeagueTable, leagueProgress, outcomeFor } from '../core/league.js';
import { leagueMatrixTable, leagueResultRows, leagueResultsTable, matrixCellLabel } from '../core/exportData.js';
import { nextGridCell, nextListIndex, NAV_KEYS } from '../core/gridNav.js';
import { tableSvg } from '../render/svg.js';
import { playerName, tableName } from '../core/state.js';
import { assignTable, pickNextMatch } from '../core/result.js';
import { sanitizeFilter, filterRows, countText, STATUS_FILTERS, MAX_NAME_FILTER } from '../core/matchFilter.js';
import { leagueRoundKeys, defaultLeagueRoundKey, restNames, playerOpponentRows } from '../core/leagueRounds.js';

const panel = () => document.getElementById('panel-league');

// スマホ幅（700px 以下）の表示。'rounds'（回戦ごと。初期表示）| 'table'（対戦表で見る）。PC 幅は常に対戦表
// round: 利用者が選んだ回戦（無ければ「試合待ちがある最初の回戦」）。player: 対戦表で選んだ選手（無ければ「自分の試合」の選手、それも無ければ「すべて」）
const view = { mode: 'rounds', round: null, player: null };
const FOLD_KEY = 'league-results';
const collapsible = () => isMobile() && view.mode === 'rounds';

/** 「対戦表で見る」で選んでいる選手の ID。「すべて」は 'all' */
function currentPlayer(l) {
  const v = view.player ?? getMyPlayerId() ?? 'all';
  return v !== 'all' && l.playerIds.includes(v) ? v : 'all';
}

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
  panel().querySelectorAll('.results-fold .results-table tr[data-match], .results-fold .result-cards [data-match]').forEach((el) => {
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
    panel().innerHTML = emptyGuideHtml('league', st);
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
    ${tableBoardHtml(st, 'league')}
  </div>
  <div class="card matrix-card" data-view="${view.mode}" data-player="${currentPlayer(l) === 'all' ? '' : '1'}">
    <h2>総当たり表 <span class="hint"><span class="owner-only">マスをクリックすると結果を入力できます</span>（行の選手から見た結果）</span></h2>
    <div class="toolbar no-print">${exportMenuHtml([
      { label: '総当たり表', csv: 'matrix-csv', png: 'matrix-png' },
      { label: '試合結果', csv: 'results-csv', png: 'results-png' },
    ])}</div>
    <div class="view-switch no-print" role="group" aria-label="表示の切り替え">
      <button type="button" class="small" data-view-mode="rounds" aria-pressed="${view.mode === 'rounds'}">回戦ごと</button>
      <button type="button" class="small" data-view-mode="table" aria-pressed="${view.mode === 'table'}">対戦表で見る</button>
    </div>
    <div class="round-view" id="league-round-view"></div>
    <div class="matrix-view">
    <div class="player-pick no-print"><label for="lp-player">選手を選ぶ</label>
      <select id="lp-player">${[['all', 'すべて'], ...l.playerIds.map((id) => [id, playerName(st, id)])].map(([v, label]) =>
        `<option value="${h(v)}" ${v === currentPlayer(l) ? 'selected' : ''}>${h(label)}</option>`).join('')}</select></div>
    <ul class="player-list no-print" id="league-player-list" aria-label="選んだ選手の対戦"></ul>
    <div class="table-wrap">
      <table class="data matrix">
        <thead><tr>${matrix.headers.map((x, i) => `<th${l.playerIds[i - 1] ? ` data-pid="${h(l.playerIds[i - 1])}"` : ''}>${nameHtml(x)}</th>`).join('')}</tr></thead>
        <tbody>${matrix.rows.map((row, i) => {
          const id = l.playerIds[i];
          return `<tr><th class="rowhead" data-pid="${h(id)}">${nameHtml(row[0])}</th>${l.playerIds.map((op, j) => {
            if (op === id) return `<td class="self" data-r="${i}" data-c="${j}">－</td>`;
            const m = pairs.get(`${id}|${op}`);
            const o = outcomeFor(m, l.results[m.id], id) || 'pending';
            return `<td class="cell ${o}" data-match="${h(m.id)}" data-r="${i}" data-c="${j}" tabindex="-1" aria-label="${h(matrixCellLabel(st, m, l.results[m.id], id, op))}" title="${h(playerName(st, id))} vs ${h(playerName(st, op))}">${h(row[j + 1])}</td>`;
          }).join('')}${row.slice(n + 1).map((c) => `<td>${h(c)}</td>`).join('')}</tr>`;
        }).join('')}</tbody>
      </table>
    </div>
    </div>
  </div>
  <div class="card">
    ${foldHtml({ key: FOLD_KEY, title: '試合結果一覧', count: `${rows.length}試合`, body: `${filterBarHtml(st, rows, f)}
    <div class="table-wrap results-table">
      <table class="data results">
        <thead><tr>${['試合番号', '回戦', '卓', '時間帯', '選手1', 'スコア', '選手2', '結果', '状態'].map((x) => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(({ match: m, cells }) => `<tr class="st-${m.status} clickable" data-match="${h(m.id)}" tabindex="-1" aria-label="${h(rowLabel(cells))}">
          ${cells.map((c, i) => {
            if (i === 8) return `<td>${statusBadge(matchStatusKey(m))}</td>`;
            const pid = { 4: m.p1, 6: m.p2 }[i]; // 選手の列には ID を付ける（「自分の試合」の強調）
            return `<td${[0, 3, 5].includes(i) ? ' class="num"' : ''}${typeof pid === 'string' ? ` data-pid="${h(pid)}"` : ''}>${nameHtml(c)}</td>`;
          }).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
    ${resultCardsHtml(rows)}` })}
  </div>`;
  fillRoundView();
  fillPlayerList();
  syncFold(panel(), FOLD_KEY, collapsible);
  applyFilter(rows, f);
  syncRoving();
}

/** スマホ幅の「回戦ごと」表示（回戦のタブ＋試合のカード＋休みの選手）を、今の状態で描く */
function fillRoundView() {
  const host = document.getElementById('league-round-view');
  const st = getState();
  if (!host || !st.league) return;
  const res = resolveLeague(st.league, st.tables);
  const keys = leagueRoundKeys(res);
  const key = pickKey(view.round, keys, defaultLeagueRoundKey(res));
  const rest = restNames(st, res, key);
  host.innerHTML = roundPanelHtml({
    keys, key, rows: leagueResultRows(st), isClickable: () => true,
    footer: rest.length ? `<p class="round-rest">休み：${h(rest.join('、'))}</p>` : '',
  });
  host.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' }); // 選んだタブが見える位置に
}

/** 「対戦表で見る」で選んだ選手の対戦を、縦のリストで描く（「すべて」のときは空で、対戦表を出す） */
function fillPlayerList() {
  const host = document.getElementById('league-player-list');
  const st = getState();
  if (!host || !st.league) return;
  const id = currentPlayer(st.league);
  const pick = document.getElementById('lp-player');
  if (pick) pick.value = id; // 「自分の試合」で名前を選んだあとに切り替えたときも、その名前が初期値になる
  host.closest('.matrix-card')?.setAttribute('data-player', id === 'all' ? '' : '1');
  host.innerHTML = id === 'all' ? '' : playerOpponentRows(st, id).map((r) => `<li><button type="button" class="pl-row st-${h(r.match.status)}" data-match="${h(r.match.id)}">
      <span class="pl-round">${r.round}回戦</span>
      <span class="pl-opp" data-pid="${h(r.opponentId)}">${h(r.opponent)}</span>
      <span class="pl-result pl-${r.outcome ?? 'pending'}">${h(r.text || '未実施')}</span>
      <span class="pl-status">${statusBadge(matchStatusKey(r.match))}</span></button></li>`).join('');
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
  const list = [...mine('.results-table tr[data-match]'), ...mine('.result-cards [data-match]'), ...mine('.player-list [data-match]')].filter((x) => x.getClientRects().length > 0);
  const shown = (x) => x.getClientRects().length > 0;
  const target = region === 'list' ? list[0] ?? cells.find(shown) : cells.find(shown) ?? list[0]; // スマホの「回戦ごと」では対戦表が隠れているので、見えている方へ
  target?.scrollIntoView({ block: region === 'next' ? 'center' : 'nearest', inline: 'nearest', behavior: scrollBehavior() });
  for (const el of [...cells, ...list]) flash(el);
}

function openMatch(id, region = 'next') {
  const st = getState();
  const l = st.league;
  const res = resolveLeague(l, st.tables);
  const m = res.matches.find((x) => x.id === id);
  if (!m) return;
  if (region === 'rounds') view.round = String(m.round); // 回戦ごとの表示から開いたときは、保存して回戦が全部終わっても、その回戦のままにする
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
    onUnstart: m.startedAt ? () => changeStart('league', id, false) : undefined, // 進行中の試合は、ここで開始を取り消せる
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
      await downloadPNG(tableSvg(st, table, pngOptions), table.title);
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
  syncRoving(); // 隠れた行に、Tab の停止位置が残らないように
}

function resetFilter() {
  filter = null;
  saveFilter();
  renderLeague();
}

// ---- キーボード操作（ローピング tabindex）----
// 対戦表（.matrix）では、Tab が止まるのは1マスだけ（tabindex="0"、ほかは -1）。矢印キーで上下左右のマス（自分自身のマスは飛ばす）、
// Home／End で行の先頭／最後、Enter・Space で結果入力。試合結果一覧の表も、上下の矢印キーで行を移る。
// 画面は保存のたびに作り直すので、どのマス・行にいるかは、位置（行・列／試合）で覚えておく。
const rov = { cell: null, row: null }; // cell: {r, c}、row: 試合の ID
let returnTo = null; // 結果入力を閉じたときにフォーカスを戻す先: { cell: {r, c} } か { row: 試合の ID }

/** 一覧の行を読み上げる文（例:「No.3 山田 太郎 対 佐藤 花子、2 － 1、終了」）。cells は leagueResultRows の cells */
const rowLabel = (cells) => `No.${cells[0]} ${cells[4]} 対 ${cells[6]}、${cells[5] ? `スコア ${cells[5]}、` : ''}${cells[8]}`;

const matrixCells = () => [...panel().querySelectorAll('.matrix td.cell[data-r]')];
const cellAt = (r, c) => panel().querySelector(`.matrix td.cell[data-r="${r}"][data-c="${c}"]`);
const isShown = (el) => el.getClientRects().length > 0;
const resultRows = () => [...panel().querySelectorAll('.results-table tbody tr[data-match]')].filter(isShown);

/** Tab の停止位置を1つにそろえる（描き直したあと・絞り込んだあと・フォーカスが動いたあと） */
function syncRoving() {
  const cells = matrixCells();
  if (cells.length) {
    const cur = (rov.cell && cellAt(rov.cell.r, rov.cell.c)) || cells.find(isShown) || cells[0];
    for (const el of cells) el.tabIndex = el === cur ? 0 : -1;
    rov.cell = { r: Number(cur.dataset.r), c: Number(cur.dataset.c) };
  }
  const rows = resultRows();
  for (const el of panel().querySelectorAll('.results-table tbody tr[data-match]')) el.tabIndex = -1;
  if (rows.length) {
    const cur = rows.find((x) => x.dataset.match === rov.row) || rows[0];
    cur.tabIndex = 0;
    rov.row = cur.dataset.match;
  }
}

function focusCell(r, c) {
  const el = cellAt(r, c);
  if (!el) return;
  rov.cell = { r, c };
  syncRoving();
  el.focus();
}

function onRovingKey(e) {
  const cell = e.target.closest?.('.matrix td.cell[data-r]');
  const row = !cell && e.target.closest?.('.results-table tbody tr[data-match]');
  if (!cell && !row) return;
  if (e.target !== cell && e.target !== row) return; // 行の中の部品（ボタンなど）のキーは、そのまま
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault(); // Space でページが動かないように
    (cell || row).click(); // 結果入力（閲覧専用のときは開かない）
    return;
  }
  if (!NAV_KEYS.includes(e.key)) return;
  if (cell) {
    const rows = panel().querySelectorAll('.matrix tbody tr').length;
    const cols = rows; // 対戦表は正方形（選手 × 選手）
    const to = nextGridCell({ rows, cols, r: Number(cell.dataset.r), c: Number(cell.dataset.c), key: e.key, canFocus: (r, c) => !!cellAt(r, c) });
    e.preventDefault();
    focusCell(to.r, to.c);
    return;
  }
  const rows = resultRows();
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') return;
  const at = nextListIndex({ count: rows.length, i: rows.indexOf(row), key: e.key });
  e.preventDefault();
  if (at >= 0) { rov.row = rows[at].dataset.match; syncRoving(); rows[at].focus(); }
}

/** Tab・クリックでフォーカスが入ったマス・行を、次の Tab の停止位置にする */
function onRovingFocus(e) {
  const cell = e.target.closest?.('.matrix td.cell[data-r]');
  if (cell) { rov.cell = { r: Number(cell.dataset.r), c: Number(cell.dataset.c) }; syncRoving(); return; }
  const row = e.target.closest?.('.results-table tbody tr[data-match]');
  if (row && e.target === row) { rov.row = row.dataset.match; syncRoving(); }
}

/** 結果入力を開いた要素（マス・一覧の行）を覚える。閉じたら、保存で画面が作り直されていても、同じ位置にフォーカスを戻す */
function rememberReturn(el) {
  const cell = el.closest('.matrix td.cell[data-r]');
  const row = !cell && el.closest('.results-table tbody tr[data-match]');
  returnTo = cell ? { cell: { r: Number(cell.dataset.r), c: Number(cell.dataset.c) } } : row ? { row: row.dataset.match } : null;
}

function restoreFocus() {
  if (!returnTo || !panel() || panel().hidden) return;
  if (returnTo.cell) focusCell(returnTo.cell.r, returnTo.cell.c);
  else {
    const el = [...panel().querySelectorAll('.results-table tbody tr[data-match]')].find((x) => x.dataset.match === returnTo.row && isShown(x));
    if (el) { rov.row = returnTo.row; syncRoving(); el.focus(); }
  }
}

export function setupLeagueView() {
  const p = panel();
  setupStartButtons(p, 'league');
  setupFold(p, FOLD_KEY, collapsible);
  p.addEventListener('input', (e) => { if (e.target.closest('.match-filter')) onFilterChange(); });
  p.addEventListener('change', (e) => {
    if (e.target.closest('.match-filter')) onFilterChange();
    if (e.target.id === 'lp-player') { view.player = e.target.value; fillPlayerList(); }
  });
  p.addEventListener('keydown', onRovingKey);
  p.addEventListener('focusin', onRovingFocus);
  document.getElementById('result-dialog').addEventListener('close', restoreFocus);
  p.addEventListener('click', (e) => {
    if (e.target.closest('[data-filter-reset]')) { resetFilter(); return; }
    const sw = e.target.closest('[data-view-mode]');
    if (sw) {
      view.mode = sw.dataset.viewMode;
      const card = sw.closest('.matrix-card');
      card?.setAttribute('data-view', view.mode);
      card?.querySelectorAll('[data-view-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.viewMode === view.mode)));
      syncFold(p, FOLD_KEY, collapsible);
      fillPlayerList();
      return;
    }
    const tab = e.target.closest('[data-round-tab]');
    if (tab) { view.round = tab.dataset.roundTab; fillRoundView(); return; }
    const c = e.target.closest('[data-match]');
    if (c) {
      rememberReturn(c);
      const region = c.closest('.matrix') ? 'matrix' : c.closest('#league-round-view') ? 'rounds' : c.closest('.results-table, .result-cards, .player-list') ? 'list' : 'next';
      openMatch(c.dataset.match, region);
      return;
    }
    const ex = e.target.closest('[data-export]');
    if (ex) onExport(ex.dataset.export);
  });
}
