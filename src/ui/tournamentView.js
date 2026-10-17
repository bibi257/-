// トーナメントタブ

import { getState, setState } from './store.js';
import { h, toast, measureText, downloadCSV, downloadPNG } from './io.js';
import { openResultDialog } from './resultDialog.js';
import {
  resolveBracket, setTournamentResult, setTournamentTable, roundName, tournamentProgress, missingPlayers,
} from '../core/bracket.js';
import { bracketTable, tournamentResultRows, tournamentResultsTable } from '../core/exportData.js';
import { bracketSvg, tableSvg } from '../render/svg.js';
import { playerName, tableName } from '../core/state.js';
import { assignTable } from '../core/result.js';

const panel = () => document.getElementById('panel-tournament');

function samePlayers(a, b) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

export function renderTournament() {
  const st = getState();
  const t = st.tournament;
  if (!t) {
    panel().innerHTML = `<div class="card empty-state"><p>トーナメント表はまだ作成されていません。</p>
      <button type="button" class="primary" data-goto="setup">参加者・設定へ</button></div>`;
    return;
  }
  const res = resolveBracket(t, st.tables);
  const prog = tournamentProgress(res);
  const changed = !samePlayers(t.playerIds, st.players.map((p) => p.id));
  const missing = missingPlayers(t, st.players).length;
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  const { svg } = bracketSvg(st, { measure: measureText, interactive: true });
  const rows = tournamentResultRows(st);
  const champ = res.champion ? playerName(st, res.champion) : '';

  panel().innerHTML = `
  ${changed ? `<div class="notice">参加者が追加・削除されています${missing ? `（表に含まれる${missing}人が名簿から削除済み）` : ''}。反映するには「参加者・設定」でトーナメント表を作り直してください。</div>` : ''}
  <div class="card no-print">
    <h2>進行状況</h2>
    <div class="progress">
      <div class="progress-bar" aria-hidden="true"><div style="width:${pct}%"></div></div>
      <span><b>${prog.done}</b> / ${prog.total} 試合終了</span>
      ${champ ? `<span class="champion">優勝 ${h(champ)}</span>` : ''}
    </div>
    ${prog.ready.length ? `<p class="hint">次に行う試合（クリックで結果入力）</p>
    <div class="next-list">${prog.ready.map((m) => `<button type="button" class="next-item" data-match="${m.id}">
      <b>No.${m.no}</b> ${h(m.tableId ? tableName(st, m.tableId) : '')} ${h(playerName(st, m.p1))} vs ${h(playerName(st, m.p2))}</button>`).join('')}</div>` : ''}
  </div>
  <div class="card">
    <h2>トーナメント表 <span class="hint">試合をクリックすると結果を入力できます</span></h2>
    <div class="toolbar">
      <span class="group"><span class="group-label">トーナメント表</span>
        <button type="button" class="small" data-export="bracket-csv">CSV</button>
        <button type="button" class="small" data-export="bracket-png">PNG</button></span>
      <span class="group"><span class="group-label">試合結果</span>
        <button type="button" class="small" data-export="results-csv">CSV</button>
        <button type="button" class="small" data-export="results-png">PNG</button></span>
      <span class="group"><button type="button" class="small" data-export="print">印刷</button></span>
    </div>
    <div class="bracket-wrap" id="bracket-wrap">${svg}</div>
  </div>
  <div class="card">
    <h2>試合結果一覧</h2>
    <div class="table-wrap">
      <table class="data results">
        <thead><tr>${['試合番号', '回戦', '卓', '時間帯', '選手1', 'スコア', '選手2', '勝者', '状態'].map((x) => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(({ match: m, cells }) => `<tr class="st-${m.status}${m.playable ? ' clickable' : ''}" ${m.playable ? `data-match="${m.id}"` : ''}>
          ${cells.map((c, i) => `<td${[0, 3, 5].includes(i) ? ' class="num"' : ''}>${h(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  </div>`;
}

function openMatch(id) {
  const st = getState();
  const t = st.tournament;
  const res = resolveBracket(t, st.tables);
  const m = res.matches.find((x) => x.id === id);
  if (!m || !m.playable) return;
  const R = res.roundCount;
  const editable = m.status === 'ready' || m.status === 'done';
  const r = m.result;
  const seq = res.playable.filter((x) => x.round === m.round).indexOf(m);
  const auto = assignTable(seq, st.tables, null);
  openResultDialog({
    title: `${m.isThirdPlace ? '3位決定戦' : roundName(m.round, R)}　試合 No.${m.no}`,
    sub: `${m.tableId ? tableName(st, m.tableId) : ''}${m.timeSlot ? `・時間帯 ${m.timeSlot}` : ''}`,
    p1Name: m.p1 === undefined ? '（未定）' : playerName(st, m.p1),
    p2Name: m.p2 === undefined ? '（未定）' : playerName(st, m.p2),
    result: r ? { outcome: r.winnerId === m.p1 ? 'p1' : 'p2', score1: r.score1, score2: r.score2, walkover: r.walkover } : null,
    allowDraw: false,
    editable,
    notice: '対戦者がまだ決まっていません。卓だけ変更できます。',
    tables: st.tables,
    tableOverride: t.tableOverrides?.[id] ?? null,
    autoTableName: tableName(st, auto.tableId),
    onSave(input, tableId, { tableOnly }) {
      let next = setTournamentTable(t, id, tableId);
      if (!tableOnly) {
        const out = setTournamentResult(next, id, input);
        if (!out.ok) return out.error;
        if (out.cleared.length) {
          const names = out.cleared.map((cid) => {
            const cm = res.matches.find((x) => x.id === cid);
            return cm ? `${cm.isThirdPlace ? '3位決定戦' : roundName(cm.round, R)} No.${cm.no}` : cid;
          });
          if (!confirm(`この変更で対戦者が変わるため、次の試合の結果が取り消されます。\n\n${names.join('\n')}\n\nよろしいですか？`)) {
            return '変更を中止しました';
          }
        }
        next = out.tournament;
      }
      setState({ ...getState(), tournament: next });
      toast(tableOnly ? '卓を変更しました' : input ? '結果を保存しました' : '結果を取り消しました');
      return null;
    },
  });
}

async function onExport(kind) {
  const st = getState();
  try {
    if (kind === 'bracket-csv') downloadCSV(bracketTable(st));
    else if (kind === 'results-csv') downloadCSV(tournamentResultsTable(st));
    else if (kind === 'bracket-png') await downloadPNG(bracketSvg(st, { measure: measureText }), `${st.meta.title} トーナメント表`);
    else if (kind === 'results-png') {
      const table = tournamentResultsTable(st);
      await downloadPNG(tableSvg(st, table, { measure: measureText }), table.title);
    } else if (kind === 'print') window.print();
  } catch (e) {
    toast(`出力に失敗しました: ${e.message}`, { error: true });
  }
}

export function setupTournamentView() {
  const p = panel();
  p.addEventListener('click', (e) => {
    const g = e.target.closest('[data-match], g.match');
    if (g) { openMatch(g.dataset.match || g.dataset.id); return; }
    const ex = e.target.closest('[data-export]');
    if (ex) onExport(ex.dataset.export);
  });
  p.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('g.match')) {
      e.preventDefault();
      openMatch(e.target.dataset.id);
    }
  });
}
