// 順位表タブ

import { getState } from './store.js';
import { emptyGuideHtml } from './emptyGuide.js';
import { h, toast, pngOptions, downloadCSV, downloadPNG } from './io.js';
import { tournamentStandingsTable, tournamentStandingsRows, leagueStandingsTable } from '../core/exportData.js';
import { exportMenuHtml } from './exportMenu.js';
import { aliveBadge, nameHtml } from './badge.js';
import { tableSvg } from '../render/svg.js';
import { qualifyHtml } from './editions.js';
import { leagueStandings } from '../core/league.js';

const panel = () => document.getElementById('panel-standings');

function tableHtml(table, numCols, ids = []) {
  return `<div class="table-wrap"><table class="data">
    <thead><tr>${table.headers.map((x, i) => `<th${numCols.includes(i) ? ' class="num"' : ''}>${h(x)}</th>`).join('')}</tr></thead>
    <tbody>${table.rows.map((r, ri) => `<tr${ids[ri] ? ` data-pid="${h(ids[ri])}"` : ''}>${r.map((c, i) => `<td${numCols.includes(i) ? ' class="num"' : ''}>${nameHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

/** トーナメントの順位表。勝ち残りは順位の欄にバッジ、大会が終わったら1〜3位の行に金・銀・銅の帯 */
function tournamentTableHtml(st) {
  const table = tournamentStandingsTable(st);
  const rows = tournamentStandingsRows(st);
  const numCols = [0, 3, 4];
  return `<div class="table-wrap"><table class="data standings">
    <thead><tr>${table.headers.map((x, i) => `<th${numCols.includes(i) ? ' class="num"' : ''}>${h(x)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(({ ranking, cells }) => `<tr data-pid="${h(ranking.playerId)}" class="${ranking.phase === 'alive' ? 'st-alive' : ''}${ranking.medal ? ` medal-${ranking.medal}` : ''}">${cells.map((c, i) => {
      const inner = i === 0 && ranking.phase === 'alive' ? aliveBadge() : nameHtml(c);
      return `<td${numCols.includes(i) ? ' class="num"' : ''}>${inner}</td>`;
    }).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function toolbar(prefix) {
  return `<div class="toolbar no-print">${exportMenuHtml([{ label: '順位表', csv: `${prefix}-csv`, png: `${prefix}-png` }])}</div>`;
}

export function renderStandings() {
  const st = getState();
  if (!st.tournament && !st.league) {
    panel().innerHTML = emptyGuideHtml('standings', st);
    return;
  }
  let html = '';
  if (st.tournament) {
    html += `<div class="card"><h2>トーナメント 順位表</h2>${toolbar('t')}
      ${tournamentTableHtml(st)}
      <p class="hint">敗退した回戦で順位を決めます（同じ回戦で敗退した選手は同順位）。勝ち残っている選手は、上に並べて順位の欄に「勝ち残り」と出します。大会が終わると、1〜3位の行の左に金・銀・銅の帯が付きます。</p></div>`;
  }
  if (st.league) {
    const lt = leagueStandingsTable(st);
    html += `<div class="card"><h2>総当たり 順位表</h2>${toolbar('l')}
      ${tableHtml(lt, [0, 2, 3, 4, 5, 6, 7, 8, 9], leagueStandings(st.league, st.settings.league).map((r) => r.playerId))}<p class="hint">${h(lt.note)}</p>${qualifyHtml(st)}</div>`;
  }
  panel().innerHTML = html;
}

async function onExport(kind) {
  const st = getState();
  try {
    if (kind === 'print') { window.print(); return; }
    const table = kind.startsWith('t-') ? tournamentStandingsTable(st) : leagueStandingsTable(st);
    if (kind.endsWith('-csv')) downloadCSV(table);
    else await downloadPNG(tableSvg(st, table, pngOptions), table.title);
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
