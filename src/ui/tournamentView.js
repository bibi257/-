// トーナメントタブ

import { getState, setState } from './store.js';
import { h, toast, measureText, downloadCSV, downloadPNG } from './io.js';
import { openResultDialog } from './resultDialog.js';
import { nextEditionButton } from './editions.js';
import { nextItemHtml } from './callCard.js';
import { exportMenuHtml } from './exportMenu.js';
import { podiumHtml } from './podium.js';
import { tableBoardHtml } from './tableBoardView.js';
import { setupStartButtons } from './startMatch.js';
import { statusBadge, matchStatusKey } from './badge.js';
import { resultCardsHtml } from './resultCards.js';
import { controlsHtml, setupWrap, setupBracketControls, revealMatch, viewSwitchHtml, viewMode, getRoundSel } from './bracketView.js';
import { roundViewHtml, THIRD_KEY } from './roundView.js';
import {
  resolveBracket, setTournamentResult, setTournamentTable, roundName, tournamentProgress, missingPlayers,
} from '../core/bracket.js';
import { settleWalkovers } from '../core/attendance.js';
import { bracketTable, tournamentResultRows, tournamentResultsTable } from '../core/exportData.js';
import { bracketSvg, tableSvg } from '../render/svg.js';
import { playerName, tableName } from '../core/state.js';
import { eventTitle } from '../core/edition.js';
import { assignTable, pickNextMatch } from '../core/result.js';

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
  const { svg, columns } = bracketSvg(st, { measure: measureText, interactive: true });
  const R = res.roundCount;
  const columnNames = [...Array.from({ length: R }, (_, k) => roundName(k + 1, R)), '優勝'];
  const oldWrap = document.getElementById('bracket-wrap');
  const keep = oldWrap ? { left: oldWrap.scrollLeft } : null;
  const rows = tournamentResultRows(st);
  const champ = res.champion ? playerName(st, res.champion) : '';

  panel().innerHTML = `
  ${changed ? `<div class="notice">参加者が追加・削除されています${missing ? `（表に含まれる${missing}人が名簿から削除済み）` : ''}。反映するには「参加者・設定」でトーナメント表を作り直してください。</div>` : ''}
  ${podiumHtml(st, res)}
  <div class="card no-print">
    <h2>進行状況</h2>
    <div class="progress">
      <div class="progress-bar" aria-hidden="true"><div style="width:${pct}%"></div></div>
      <span><b>${prog.done}</b> / ${prog.total} 試合終了</span>
      ${champ ? `<span class="champion">優勝 ${h(champ)}</span>` : ''}
      ${res.finished ? nextEditionButton() : ''}
      <button type="button" class="small" data-call="tournament" title="会場の大型ディスプレイ向けに、次に行う試合を大きく表示します">呼び出し画面</button>
    </div>
    ${tableBoardHtml(st, 'tournament')}
    ${prog.ready.length ? `<p class="hint">次に行う試合<span class="owner-only">（クリックで結果入力）</span></p>
    <div class="next-list">${prog.ready.map((m) => nextItemHtml(st, m)).join('')}</div>` : ''}
  </div>
  <div class="card bracket-card" data-view="${viewMode()}">
    <h2>トーナメント表 <span class="hint owner-only">試合をクリックすると結果を入力できます</span></h2>
    <div class="toolbar no-print">${exportMenuHtml([
      { label: 'トーナメント表', csv: 'bracket-csv', png: 'bracket-png' },
      { label: '試合結果', csv: 'results-csv', png: 'results-png' },
    ])}</div>
    ${viewSwitchHtml()}
    ${controlsHtml(columnNames)}
    <div class="bracket-wrap" id="bracket-wrap" data-cols="${columns.join(',')}">${svg}</div>
    <div class="round-view" id="round-view"></div>
  </div>
  <div class="card">
    <h2>試合結果一覧</h2>
    <div class="table-wrap results-table">
      <table class="data results">
        <thead><tr>${['試合番号', '回戦', '卓', '時間帯', '選手1', 'スコア', '選手2', '勝者', '状態'].map((x) => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(({ match: m, cells }) => `<tr class="st-${m.status}${m.playable ? ' clickable' : ''}" ${m.playable ? `data-match="${h(m.id)}"` : ''}>
          ${cells.map((c, i) => {
            if (i === 8) return `<td>${statusBadge(matchStatusKey(m))}</td>`;
            const pid = { 4: m.p1, 6: m.p2, 7: m.winner }[i]; // 選手の列には ID を付ける（「自分の試合」の強調）
            return `<td${[0, 3, 5].includes(i) ? ' class="num"' : ''}${typeof pid === 'string' ? ` data-pid="${h(pid)}"` : ''}>${h(c)}</td>`;
          }).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
    ${resultCardsHtml(rows, (m) => m.playable)}
  </div>`;
  fillRoundView();
  const wrap = document.getElementById('bracket-wrap');
  setupWrap(wrap);
  if (keep) wrap.scrollLeft = keep.left; // 描画し直しても、横の位置は変えない
}

/** スマホ幅の「回戦ごと」表示（回戦のタブ＋試合のカード）を、今の状態で描く */
function fillRoundView() {
  const host = document.getElementById('round-view');
  const st = getState();
  if (!host || !st.tournament) return;
  const res = resolveBracket(st.tournament, st.tables);
  host.innerHTML = roundViewHtml(res, tournamentResultRows(st), getRoundSel());
  host.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' }); // 選んだタブが見える位置に
}

function openNext(afterNo) {
  const st = getState();
  if (!st.tournament) return;
  const next = pickNextMatch(tournamentProgress(resolveBracket(st.tournament, st.tables)).ready, afterNo);
  if (next) openMatch(next.id, { reveal: true });
  else toast('次に行う試合はありません');
}

function openMatch(id, { reveal = false } = {}) {
  const st = getState();
  const t = st.tournament;
  const res = resolveBracket(t, st.tables);
  const m = res.matches.find((x) => x.id === id);
  if (!m || !m.playable) return;
  if (reveal) revealMatch(id, m.isThirdPlace ? THIRD_KEY : m.round); // 「次に行う試合」から開いたときは、その位置までスクロールして強調する
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
    openNext: () => openNext(m.no),
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
      // 欠席で不戦にすると決めた選手の試合が、この結果で新しく決まったときは、続けて不戦にする
      const settled = !tableOnly && input ? settleWalkovers(next) : { tournament: next, count: 0 };
      next = settled.tournament;
      setState({ ...getState(), tournament: next });
      toast(tableOnly ? '卓を変更しました' : input ? `結果を保存しました${settled.count ? `（欠席の人の試合${settled.count}件を不戦にしました）` : ''}` : '結果を取り消しました');
      revealMatch(id, m.isThirdPlace ? THIRD_KEY : m.round); // 保存したあとも、その試合の位置を見せる
      return null;
    },
  });
}

async function onExport(kind) {
  const st = getState();
  try {
    if (kind === 'bracket-csv') downloadCSV(bracketTable(st));
    else if (kind === 'results-csv') downloadCSV(tournamentResultsTable(st));
    else if (kind === 'bracket-png') await downloadPNG(bracketSvg(st, { measure: measureText }), `${eventTitle(st)} トーナメント表`);
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
  setupBracketControls(p, { refreshRounds: fillRoundView });
  setupStartButtons(p, 'tournament');
  p.addEventListener('click', (e) => {
    const g = e.target.closest('[data-match], g.match');
    if (g) { openMatch(g.dataset.match || g.dataset.id, { reveal: !!g.closest('.next-item') }); return; }
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
