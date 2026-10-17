// エントリポイント: タブ切替・ヘッダー操作・保存/読込

import { getState, setState, onChange, onSaveStatus, initState, isReadOnly } from './store.js';
import { toast, downloadBlob, safeFileName } from './io.js';
import { createState, parseState, serializeState } from '../core/state.js';
import { renderSetup, setupSetupView } from './setupView.js';
import { renderTournament, setupTournamentView } from './tournamentView.js';
import { renderLeague, setupLeagueView } from './leagueView.js';
import { renderStandings, setupStandingsView } from './standingsView.js';
import { setupResultDialog } from './resultDialog.js';
import { renderComments, setupCommentsView } from './commentsView.js';
import { S, initShare, isSharing, isViewer, isAdmin, onShareChange, openShareDialog, setupShareDialog } from './share.js';

const TABS = { setup: renderSetup, tournament: renderTournament, league: renderLeague, standings: renderStandings, comments: renderComments };
const TAB_KEY = 'bukatsu-taikai:tab';
let activeTab = 'setup';

function render() {
  document.getElementById('print-title').textContent = getState().meta.title;
  document.title = `${getState().meta.title || '大会'} - 部内大会トーナメント`;
  TABS[activeTab]();
}

function showTab(name) {
  if (!TABS[name]) name = 'setup';
  if (isViewer() && name === 'setup') name = 'tournament'; // 閲覧中は設定画面を使わない
  if (!isSharing() && name === 'comments') name = 'setup';
  activeTab = name;
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  for (const key of Object.keys(TABS)) document.getElementById(`panel-${key}`).hidden = key !== name;
  try { sessionStorage.setItem(TAB_KEY, name); } catch { /* 無視 */ }
  render();
  window.scrollTo(0, 0);
}

/** 共有の状態に合わせて、ヘッダーの表示・コメントタブ・閲覧専用の見た目を更新する */
function updateShareUi() {
  const chip = document.getElementById('share-chip');
  const sharing = isSharing();
  chip.hidden = !sharing;
  document.getElementById('tab-comments').hidden = !sharing;
  if (sharing) {
    const bad = S.status === 'error' || S.status === 'auth';
    chip.classList.toggle('bad', bad);
    const label = S.status === 'auth' ? '再ログインが必要' : S.status === 'error' ? '通信エラー' : S.status === 'sending' ? '送信中…' : isViewer() ? '閲覧中' : '共有中';
    chip.textContent = `${label} ${S.cfg.code}`;
    chip.title = S.status === 'error' || S.status === 'auth' ? S.message : '共有の設定を開く';
    document.getElementById('tab-comments').textContent = `コメント${S.comments.length ? ` (${S.comments.length})` : ''}`;
  }
  if (!sharing && activeTab === 'comments') showTab('setup');
  else if (isViewer() && activeTab === 'setup') showTab('tournament');
  else if (activeTab === 'comments') renderComments();
}

function hasData(st) {
  return st.players.length > 0 || st.tournament || st.league;
}

function saveFile() {
  const st = getState();
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(new Blob([serializeState(st)], { type: 'application/json' }), `${safeFileName(st.meta.title || '大会')}_${date}.json`);
  toast('大会データを保存しました');
}

async function loadFile(file) {
  if (isReadOnly()) return;
  const r = parseState(await file.text());
  if (!r.ok) { toast(`読み込めませんでした: ${r.error}`, { error: true }); return; }
  if (hasData(getState()) && !confirm('今の大会データを、読み込んだデータで置き換えますか？')) return;
  setState(r.state);
  toast(`「${r.state.meta.title}」を読み込みました`);
}

function setupHeader() {
  const fileInput = document.getElementById('load-file');
  document.querySelector('.header-actions').addEventListener('click', (e) => {
    const act = e.target.closest('button[data-action]')?.dataset.action;
    if (act === 'share') openShareDialog();
    else if (act === 'new') {
      const note = isAdmin() ? '\n※共有中のため、公開している大会データも新しい内容に置き換わります。' : '';
      if (hasData(getState()) && !confirm(`今の大会データを消して新しく始めますか？\n（必要なら先に「保存」でファイルに保存してください）${note}`)) return;
      setState(createState());
      showTab('setup');
      toast('新しい大会を作成しました');
    } else if (act === 'save') saveFile();
    else if (act === 'load') fileInput.click();
    else if (act === 'print') window.print();
  });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    fileInput.value = '';
    if (f) await loadFile(f);
  });
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) showTab(b.dataset.tab);
  });
  document.querySelector('main').addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) showTab(g.dataset.goto);
  });
  window.addEventListener('app:tab', (e) => showTab(e.detail));
  const status = document.getElementById('save-status');
  onSaveStatus(({ ok, at }) => {
    status.textContent = ok ? `自動保存 ${at.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}` : '自動保存できません';
    status.title = ok ? 'このブラウザに自動保存しています' : 'ブラウザの設定で保存が無効です。「保存」でファイルに保存してください';
  });
}

function init() {
  const restored = initState();
  setupHeader();
  setupSetupView();
  setupTournamentView();
  setupLeagueView();
  setupStandingsView();
  setupResultDialog();
  setupCommentsView();
  setupShareDialog();
  onChange(render);
  onShareChange(updateShareUi);
  let tab = 'setup';
  try { tab = sessionStorage.getItem(TAB_KEY) || 'setup'; } catch { /* 無視 */ }
  initShare();
  showTab(tab);
  updateShareUi();
  if (restored && !isReadOnly()) toast('前回の続きから再開しました');
}

init();
