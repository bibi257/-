// 参加者・設定タブ

import { getState, setState } from './store.js';
import { h, toast, readFileBytes } from './io.js';
import { makePlayers, validatePlayers, movePlayer, resizeTables, cleanName, MAX_TABLES } from '../core/players.js';
import { generateTournament, bracketSize, MAX_PLAYERS, MIN_PLAYERS } from '../core/bracket.js';
import { generateLeague, MAX_LEAGUE_PLAYERS } from '../core/league.js';
import { decodeText, namesFromCSV } from '../core/csv.js';
import { editionsCardHtml } from './editions.js';

const panel = () => document.getElementById('panel-setup');

function hasResults(obj) {
  return !!obj && Object.keys(obj.results || {}).length > 0;
}

export function renderSetup() {
  const st = getState();
  const n = st.players.length;
  const s = st.settings;
  const seedMax = n;
  const size = n >= 2 ? bracketSize(n) : 0;
  panel().innerHTML = `
  <div class="grid-2">
    <div class="stack">
      <div class="card">
        <h2>大会情報</h2>
        <div class="form-row"><label for="meta-title">大会名</label><input type="text" id="meta-title" value="${h(st.meta.title)}" maxlength="60" style="flex:1"></div>
        <div class="form-row"><label for="meta-date">開催日</label><input type="date" id="meta-date" value="${h(st.meta.date)}"></div>
      </div>
      ${editionsCardHtml(st)}
      <div class="card">
        <h2>参加者 <span class="muted" id="player-count">${n}人</span>
          <span class="spacer"></span>
          <button type="button" data-act="import">一括入力・CSV取込</button>
          <button type="button" class="danger" data-act="clear-players" ${n ? '' : 'disabled'}>全員削除</button>
        </h2>
        <p class="hint">上から順にシード順位になります（シード人数は右の設定で指定）。名前は作成後も変更でき、表に反映されます。</p>
        <ul class="errors" id="player-errors" hidden></ul>
        <div class="table-wrap">
          <table class="data players">
            <thead><tr><th class="num">No</th><th>名前</th><th>並べ替え・削除</th></tr></thead>
            <tbody>
              ${st.players.map((p, i) => `
              <tr data-id="${h(p.id)}">
                <td class="idx">${i + 1}${i < Math.min(s.seedCount, n) ? `<span class="seed-badge">第${i + 1}シード</span>` : ''}</td>
                <td><input type="text" class="name" data-id="${h(p.id)}" value="${h(p.name)}" maxlength="40" aria-label="${i + 1}番目の名前"></td>
                <td class="ops">
                  <button type="button" class="icon" data-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="上へ">↑</button>
                  <button type="button" class="icon" data-act="down" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="下へ">↓</button>
                  <button type="button" class="icon danger" data-act="del" data-i="${i}" aria-label="削除">×</button>
                </td>
              </tr>`).join('') || '<tr><td colspan="3" class="muted">まだ参加者がいません。下の欄に名前を入力して追加してください。</td></tr>'}
            </tbody>
          </table>
        </div>
        <form class="add-row" id="add-player-form">
          <input type="text" id="new-player" placeholder="名前を入力して Enter で追加" maxlength="40" aria-label="追加する参加者名">
          <button type="submit">追加</button>
        </form>
      </div>
    </div>
    <div class="stack">
      <div class="card">
        <h2>卓</h2>
        <div class="form-row"><label for="table-count">使用する卓の数</label>
          <input type="number" id="table-count" min="1" max="${MAX_TABLES}" value="${st.tables.length}" style="width:6em"></div>
        <p class="hint">各回戦の試合を卓へ順番に割り当てます。卓数より試合が多いときは「時間帯」が2, 3…と分かれます。</p>
        <div class="tables-list">
          ${st.tables.map((t, i) => `<input type="text" class="table-name" data-id="${h(t.id)}" value="${h(t.name)}" maxlength="20" aria-label="卓${i + 1}の名前">`).join('')}
        </div>
      </div>
      <div class="card">
        <h2>トーナメント</h2>
        <div class="form-row"><label for="seed-count">シード人数</label>
          <input type="number" id="seed-count" min="0" max="${seedMax}" value="${Math.min(s.seedCount, seedMax)}" style="width:6em">
          <span class="hint">${n >= 2 ? `枠 ${size}・1回戦不戦（シード上位から） ${size - n}枠` : ''}</span></div>
        <div class="form-row"><label for="placement">シード以外の配置</label>
          <select id="placement">
            <option value="order" ${s.placement === 'order' ? 'selected' : ''}>名簿順</option>
            <option value="random" ${s.placement === 'random' ? 'selected' : ''}>抽選（ランダム）</option>
          </select></div>
        <div class="form-row"><label for="third-place">3位決定戦</label>
          <label><input type="checkbox" id="third-place" ${s.thirdPlace ? 'checked' : ''}> 行う</label></div>
        <p class="hint">シード人数・配置・3位決定戦は、表を作成（作り直し）したときに反映されます。</p>
        <button type="button" class="primary" data-act="gen-tournament">${st.tournament ? 'トーナメント表を作り直す' : 'トーナメント表を作成'}</button>
      </div>
      <div class="card">
        <h2>総当たり</h2>
        <div class="form-row"><label>勝点</label>
          勝 <input type="number" id="pt-win" min="0" max="99" value="${s.league.win}" style="width:4.5em">
          分 <input type="number" id="pt-draw" min="0" max="99" value="${s.league.draw}" style="width:4.5em">
          敗 <input type="number" id="pt-loss" min="0" max="99" value="${s.league.loss}" style="width:4.5em"></div>
        <div class="form-row"><label for="allow-draw">引き分け</label>
          <label><input type="checkbox" id="allow-draw" ${s.league.allowDraw ? 'checked' : ''}> あり</label></div>
        <p class="hint">順位は 勝点 → 同勝点内の直接対決 → 得失点差 → 総得点 の順に決めます。勝点の変更はすぐ反映されます。</p>
        <button type="button" class="primary" data-act="gen-league">${st.league ? '総当たり表を作り直す' : '総当たり表を作成'}</button>
      </div>
    </div>
  </div>`;
  updateValidation();
}

/** 名簿のエラー表示だけを更新（入力中に再描画しないため） */
function updateValidation() {
  const st = getState();
  const { errors, invalidIds } = validatePlayers(st.players);
  const ul = document.getElementById('player-errors');
  if (!ul) return { errors };
  ul.hidden = errors.length === 0;
  ul.innerHTML = errors.map((e) => `<li>${h(e)}</li>`).join('');
  panel().querySelectorAll('input.name').forEach((el) => el.classList.toggle('invalid', invalidIds.has(el.dataset.id)));
  return { errors };
}

function update(patch, opts) {
  setState({ ...getState(), ...patch }, opts);
}

function updateSettings(patch, opts = { render: false }) {
  const st = getState();
  setState({ ...st, settings: { ...st.settings, ...patch } }, opts);
}

function intVal(el, min, max, fallback) {
  const v = parseInt(el.value, 10);
  if (Number.isNaN(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function usedIn(st, id) {
  return (st.tournament?.playerIds.includes(id)) || (st.league?.playerIds.includes(id));
}

function canGenerate(min, max, label) {
  const st = getState();
  const { errors } = updateValidation();
  if (errors.length) { toast('参加者の名前を確認してください（空欄・重複があります）', { error: true }); return false; }
  const n = st.players.length;
  if (n < min) { toast(`${label}には${min}人以上必要です`, { error: true }); return false; }
  if (n > max) { toast(`${label}は${max}人までです`, { error: true }); return false; }
  return true;
}

function onClick(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const st = getState();
  const act = btn.dataset.act;
  const i = Number(btn.dataset.i);
  if (act === 'up' || act === 'down') {
    update({ players: movePlayer(st.players, i, act === 'up' ? -1 : 1) });
  } else if (act === 'del') {
    const p = st.players[i];
    const msg = usedIn(st, p.id)
      ? `「${p.name || '（空欄）'}」は作成済みの表に含まれています。削除すると表を作り直すまで「削除された参加者」と表示されます。削除しますか？`
      : `「${p.name || '（空欄）'}」を削除しますか？`;
    if (!confirm(msg)) return;
    update({ players: st.players.filter((_, j) => j !== i) });
  } else if (act === 'clear-players') {
    if (!confirm(`参加者 ${st.players.length}人をすべて削除しますか？`)) return;
    update({ players: [] });
  } else if (act === 'import') {
    openImport();
  } else if (act === 'gen-tournament') {
    if (!canGenerate(MIN_PLAYERS, MAX_PLAYERS, 'トーナメント')) return;
    if (st.tournament && !confirm(hasResults(st.tournament)
      ? 'トーナメント表を作り直すと、入力済みの結果はすべて消えます。作り直しますか？'
      : 'トーナメント表を作り直しますか？')) return;
    const t = generateTournament(st.players.map((p) => p.id), st.settings);
    setState({ ...st, tournament: t }, { render: false });
    toast('トーナメント表を作成しました');
    window.dispatchEvent(new CustomEvent('app:tab', { detail: 'tournament' }));
  } else if (act === 'gen-league') {
    if (!canGenerate(2, MAX_LEAGUE_PLAYERS, '総当たり')) return;
    if (st.league && !confirm(hasResults(st.league)
      ? '総当たり表を作り直すと、入力済みの結果はすべて消えます。作り直しますか？'
      : '総当たり表を作り直しますか？')) return;
    setState({ ...st, league: generateLeague(st.players.map((p) => p.id)) }, { render: false });
    toast('総当たり表を作成しました');
    window.dispatchEvent(new CustomEvent('app:tab', { detail: 'league' }));
  }
}

function onInput(e) {
  const el = e.target;
  const st = getState();
  if (el.matches('input.name')) {
    const players = st.players.map((p) => (p.id === el.dataset.id ? { ...p, name: cleanName(el.value) } : p));
    update({ players }, { render: false });
    updateValidation();
  } else if (el.matches('input.table-name')) {
    update({ tables: st.tables.map((t) => (t.id === el.dataset.id ? { ...t, name: el.value.slice(0, 20) } : t)) }, { render: false });
  } else if (el.id === 'meta-title') {
    update({ meta: { ...st.meta, title: el.value } }, { render: false });
    document.getElementById('print-title').textContent = el.value;
  } else if (el.id === 'meta-date') {
    update({ meta: { ...st.meta, date: el.value } }, { render: false });
  }
}

function onChangeEvt(e) {
  const el = e.target;
  const st = getState();
  if (el.id === 'table-count') {
    const n = intVal(el, 1, MAX_TABLES, st.tables.length);
    update({ tables: resizeTables(st.tables, n) });
  } else if (el.id === 'seed-count') {
    updateSettings({ seedCount: intVal(el, 0, st.players.length, 0) }, { render: true });
  } else if (el.id === 'placement') {
    updateSettings({ placement: el.value === 'random' ? 'random' : 'order' });
  } else if (el.id === 'third-place') {
    updateSettings({ thirdPlace: el.checked });
  } else if (['pt-win', 'pt-draw', 'pt-loss'].includes(el.id) || el.id === 'allow-draw') {
    const p = (id, fb) => intVal(document.getElementById(id), 0, 99, fb);
    updateSettings({ league: {
      win: p('pt-win', st.settings.league.win), draw: p('pt-draw', st.settings.league.draw),
      loss: p('pt-loss', st.settings.league.loss), allowDraw: document.getElementById('allow-draw').checked,
    } }, { render: true });
  } else if (el.matches('input.name')) {
    // 確定時に前後の空白を除いた値で再表示
    el.value = cleanName(el.value);
  }
}

function onSubmit(e) {
  if (e.target.id !== 'add-player-form') return;
  e.preventDefault();
  const input = document.getElementById('new-player');
  const name = cleanName(input.value);
  if (!name) { input.focus(); return; }
  const st = getState();
  if (st.players.length >= MAX_PLAYERS) { toast(`参加者は${MAX_PLAYERS}人までです`, { error: true }); return; }
  update({ players: [...st.players, ...makePlayers([name])] });
  document.getElementById('new-player').focus();
}

// ---- 一括入力・CSV取込 ----
function openImport() {
  const dlg = document.getElementById('import-dialog');
  document.getElementById('im-text').value = '';
  document.getElementById('im-error').textContent = '';
  document.getElementById('im-file-name').textContent = '';
  dlg.showModal();
  document.getElementById('im-text').focus();
}

function setupImport() {
  const dlg = document.getElementById('import-dialog');
  const file = document.getElementById('im-file');
  document.getElementById('im-file-btn').addEventListener('click', () => file.click());
  document.getElementById('im-cancel').addEventListener('click', () => dlg.close());
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const names = namesFromCSV(decodeText(await readFileBytes(f)));
      document.getElementById('im-text').value = names.join('\n');
      document.getElementById('im-file-name').textContent = `${f.name}（${names.length}人）`;
    } catch {
      document.getElementById('im-error').textContent = 'ファイルを読み込めませんでした';
    }
    file.value = '';
  });
  document.getElementById('import-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const names = namesFromCSV(document.getElementById('im-text').value).map(cleanName).filter(Boolean);
    if (!names.length) { document.getElementById('im-error').textContent = '名前が入力されていません'; return; }
    const st = getState();
    const replace = document.querySelector('input[name="im-mode"]:checked').value === 'replace';
    const base = replace ? [] : st.players;
    if (base.length + names.length > MAX_PLAYERS) {
      document.getElementById('im-error').textContent = `参加者は${MAX_PLAYERS}人までです（取込後 ${base.length + names.length}人）`;
      return;
    }
    if (replace && st.players.length && !confirm(`今の名簿（${st.players.length}人）を置き換えますか？`)) return;
    update({ players: [...base, ...makePlayers(names)] });
    dlg.close();
    toast(`${names.length}人を取り込みました`);
  });
}

export function setupSetupView() {
  const p = panel();
  p.addEventListener('click', onClick);
  p.addEventListener('input', onInput);
  p.addEventListener('change', onChangeEvt);
  p.addEventListener('submit', onSubmit);
  setupImport();
}
