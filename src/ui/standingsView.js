// 順位表タブ

import { getState } from './store.js';
import { h, toast, measureText, downloadCSV, downloadPNG } from './io.js';
import { tournamentStandingsTable, leagueStandingsTable } from '../core/exportData.js';
import { tableSvg } from '../render/svg.js';
import { qualifyHtml } from './editions.js';

const panel = () => document.getElementById('panel-standings');

function tableHtml(table, numCols) {
  return `<div class="table-wrap"><table class="data">
    <thead><tr>${table.headers.map((x, i) => `<th${numCols.includes(i) ? ' class="num"' : ''}>${h(x)}</th>`).join('')}</tr></thead>
    <tbody>${table.rows.map((r) => `<tr>${r.map((c, i) => `<td${numCols.includes(i) ? ' class="num"' : ''}>${h(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function toolbar(prefix) {
  return `<div class="toolbar"><span class="group">
    <button type="button" class="small" data-export="${prefix}-csv">CSV</button>
    <button type="button" class="small" data-export="${prefix}-png">PNG</button>
    <button type="button" class="small" data-export="print">印刷</button></span></div>`;
}

export function renderStandings() {
  const st = getState();
  if (!st.tournament && !st.league) {
    panel().innerHTML = `<div class="card empty-state"><p>表を作成すると、ここに順位表が表示されます。</p>
      <button type="button" class="primary" data-goto="setup">参加者・設定へ</button></div>`;
    return;
  }
  let html = '';
  if (st.tournament) {
    html += `<div class="card"><h2>トーナメント 順位表</h2>${toolbar('t')}
      ${tableHtml(tournamentStandingsTable(st), [0, 3, 4])}
      <p class="hint">敗退した回戦で順位を決めます（同じ回戦で敗退した選手は同順位）。勝ち残っている選手は順位が空欄です。</p></div>`;
  }
  if (st.league) {
    const lt = leagueStandingsTable(st);
    html += `<div class="card"><h2>総当たり 順位表</h2>${toolbar('l')}
      ${tableHtml(lt, [0, 2, 3, 4, 5, 6, 7, 8, 9])}<p class="hint">${h(lt.note)}</p>${qualifyHtml(st)}</div>`;
  }
  panel().innerHTML = html;
}

async function onExport(kind) {
  const st = getState();
  try {
    if (kind === 'print') { window.print(); return; }
    const table = kind.startsWith('t-') ? tournamentStandingsTable(st) : leagueStandingsTable(st);
    if (kind.endsWith('-csv')) downloadCSV(table);
    else await downloadPNG(tableSvg(st, table, { measure: measureText }), table.title);
  } catch (e) {
    toast(`出力に失敗しました: ${e.message}`, { error: true });
  }
}

export function setupStandingsView() {
  panel().addEventListener('click', (e) => {
    const ex = e.target.closest('[data-export]');
    if (ex) onExport(ex.dataset.export);
  });
}
