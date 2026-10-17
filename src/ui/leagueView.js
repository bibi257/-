// 総当たりタブ

import { getState, setState } from './store.js';
import { h, toast, measureText, downloadCSV, downloadPNG } from './io.js';
import { openResultDialog } from './resultDialog.js';
import { resolveLeague, setLeagueResult, setLeagueTable, leagueProgress, outcomeFor } from '../core/league.js';
import { leagueMatrixTable, leagueResultRows, leagueResultsTable } from '../core/exportData.js';
import { tableSvg } from '../render/svg.js';
import { playerName, tableName } from '../core/state.js';
import { assignTable } from '../core/result.js';

const panel = () => document.getElementById('panel-league');

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

  panel().innerHTML = `
  ${changed ? '<div class="notice">参加者が追加・削除されています。反映するには「参加者・設定」で総当たり表を作り直してください。</div>' : ''}
  <div class="card no-print">
    <h2>進行状況</h2>
    <div class="progress">
      <div class="progress-bar" aria-hidden="true"><div style="width:${pct}%"></div></div>
      <span><b>${prog.done}</b> / ${prog.total} 試合終了</span>
      ${prog.nextRound ? `<span class="muted">次は ${prog.nextRound}回戦${res.rest[prog.nextRound - 1].length ? `（休み: ${h(res.rest[prog.nextRound - 1].map((id) => playerName(st, id)).join('、'))}）` : ''}</span>` : '<span class="champion">全試合終了</span>'}
    </div>
    ${prog.ready.length ? `<div class="next-list">${prog.ready.map((m) => `<button type="button" class="next-item" data-match="${h(m.id)}">
      <b>No.${m.no}</b> ${h(m.tableId ? tableName(st, m.tableId) : '')}${m.timeSlot > 1 ? `（時間帯${m.timeSlot}）` : ''} ${h(playerName(st, m.p1))} vs ${h(playerName(st, m.p2))}</button>`).join('')}</div>` : ''}
  </div>
  <div class="card">
    <h2>総当たり表 <span class="hint"><span class="owner-only">マスをクリックすると結果を入力できます</span>（行の選手から見た結果）</span></h2>
    <div class="toolbar">
      <span class="group"><span class="group-label">総当たり表</span>
        <button type="button" class="small" data-export="matrix-csv">CSV</button>
        <button type="button" class="small" data-export="matrix-png">PNG</button></span>
      <span class="group"><span class="group-label">試合結果</span>
        <button type="button" class="small" data-export="results-csv">CSV</button>
        <button type="button" class="small" data-export="results-png">PNG</button></span>
      <span class="group"><button type="button" class="small" data-export="print">印刷</button></span>
    </div>
    <div class="table-wrap">
      <table class="data matrix">
        <thead><tr>${matrix.headers.map((x) => `<th>${h(x)}</th>`).join('')}</tr></thead>
        <tbody>${matrix.rows.map((row, i) => {
          const id = l.playerIds[i];
          return `<tr><th class="rowhead">${h(row[0])}</th>${l.playerIds.map((op, j) => {
            if (op === id) return '<td class="self">－</td>';
            const m = pairs.get(`${id}|${op}`);
            const o = outcomeFor(m, l.results[m.id], id) || 'pending';
            return `<td class="cell ${o}" data-match="${h(m.id)}" title="${h(playerName(st, id))} vs ${h(playerName(st, op))}">${h(row[j + 1]) || '・'}</td>`;
          }).join('')}${row.slice(n + 1).map((c) => `<td>${h(c)}</td>`).join('')}</tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  </div>
  <div class="card">
    <h2>試合結果一覧</h2>
    <div class="table-wrap">
      <table class="data results">
        <thead><tr>${['試合番号', '回戦', '卓', '時間帯', '選手1', 'スコア', '選手2', '結果', '状態'].map((x) => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(({ match: m, cells }) => `<tr class="st-${m.status} clickable" data-match="${h(m.id)}">
          ${cells.map((c, i) => `<td${[0, 3, 5].includes(i) ? ' class="num"' : ''}>${h(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  </div>`;
}

function openMatch(id) {
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
    onSave(input, tableId, { tableOnly }) {
      let next = setLeagueTable(l, id, tableId);
      if (!tableOnly) {
        const out = setLeagueResult(next, id, input, { allowDraw: st.settings.league.allowDraw });
        if (!out.ok) return out.error;
        next = out.league;
      }
      setState({ ...getState(), league: next });
      toast(tableOnly ? '卓を変更しました' : input ? '結果を保存しました' : '結果を取り消しました');
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

export function setupLeagueView() {
  const p = panel();
  p.addEventListener('click', (e) => {
    const c = e.target.closest('[data-match]');
    if (c) { openMatch(c.dataset.match); return; }
    const ex = e.target.closest('[data-export]');
    if (ex) onExport(ex.dataset.export);
  });
}
