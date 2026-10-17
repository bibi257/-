// 共有（運営が大会データを公開し、閲覧者が見る・コメントする）の通信・同期・ダイアログ
//
// 運営: 保存のたびに大会データを送信（少し待ってまとめて）。閲覧者: 15秒ごとに更新を確認。
// 閲覧中は store を読み取り専用にし、この端末の自動保存データを上書きしない。

import { getState, setState, setReadOnly, setRemoteState, reloadLocal, onSaved } from './store.js';
import { toast, h } from './io.js';
import { createState, parseState } from '../core/state.js';
import { normalizeBase, defaultBase, normalizeCode, viewerLink, codeFromHash, PASSWORD_MIN } from '../core/share.js';

const KEY = 'bukatsu-taikai:share';
const NAME_KEY = 'bukatsu-taikai:comment-name';
const POLL_MS = 15000;
const PUSH_DELAY_MS = 1500;

/** 画面が読む共有の状態 */
export const S = {
  cfg: null, // { base, code, role, token, exp }
  status: 'off', // off | ok | sending | error | auth
  message: '',
  rev: -1,
  crev: -1,
  comments: [],
  title: '',
  updatedAt: null, // サーバー側の最終更新（秒）
  lastPush: null,
};

let pollTimer = null;
let pushTimer = null;
let dirty = false;
let pushing = false;
const listeners = new Set();
const $ = (id) => document.getElementById(id);

export const onShareChange = (f) => listeners.add(f);
const emit = () => listeners.forEach((f) => f());
export const isSharing = () => !!S.cfg;
export const isViewer = () => S.cfg?.role === 'viewer';
export const isAdmin = () => S.cfg?.role === 'admin';

export function getCommentName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
export function setCommentName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* 無視 */ }
}

function saveCfg() {
  try {
    if (S.cfg) localStorage.setItem(KEY, JSON.stringify(S.cfg));
    else localStorage.removeItem(KEY);
  } catch { /* 無視 */ }
}

function loadCfg() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (c && typeof c.base === 'string' && typeof c.token === 'string' && normalizeCode(c.code) && ['admin', 'viewer'].includes(c.role)) return c;
  } catch { /* 無視 */ }
  return null;
}

// ---- 通信 ----

class ShareError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(base, method, path, { token, body } = {}) {
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ShareError(0, '共有サーバーに接続できませんでした。通信状況とサーバーURLを確認してください');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new ShareError(res.status, data?.error || `サーバーの応答が正しくありません（${res.status}）`);
  return data;
}

const call = (method, path, body) => request(S.cfg.base, method, `/api/rooms/${S.cfg.code}${path}`, { token: S.cfg.token, body });

function setStatus(status, message = '') {
  S.status = status;
  S.message = message;
  emit();
}

// ---- 接続・切断 ----

function useSession(base, data, role) {
  S.cfg = { base, code: data.code, role, token: data.token, exp: data.expiresAt };
  S.rev = -1;
  S.crev = -1;
  S.comments = [];
  S.title = '';
  S.updatedAt = null;
  saveCfg();
  if (role === 'viewer') enterViewer();
  setStatus('ok');
  startPolling();
}

function enterViewer() {
  setReadOnly(true);
  document.body.classList.add('viewer');
  setRemoteState(createState());
}

function leaveViewer() {
  setReadOnly(false);
  document.body.classList.remove('viewer');
  reloadLocal();
}

/** 運営として共有を始める。大会データをすぐ送信する */
async function startShare({ base, viewerPassword, adminPassword }) {
  const data = await request(base, 'POST', '/api/rooms', { body: { viewerPassword, adminPassword, title: getState().meta.title } });
  useSession(base, data, 'admin');
  await pushNow();
  return data.code;
}

async function login({ base, code, password, role }) {
  const data = await request(base, 'POST', `/api/rooms/${code}/login`, { body: { role, password } });
  return data;
}

async function joinViewer(args) {
  const data = await login({ ...args, role: 'viewer' });
  useSession(args.base, data, 'viewer');
  await pollOnce();
  window.dispatchEvent(new CustomEvent('app:tab', { detail: 'tournament' }));
}

async function joinAdmin(args) {
  const data = await login({ ...args, role: 'admin' });
  useSession(args.base, data, 'admin');
  const r = await call('GET', '/sync?rev=-1&crev=-1');
  S.rev = r.rev;
  S.crev = r.crev;
  S.comments = r.comments || [];
  if (r.state) {
    const parsed = parseState(r.state);
    if (parsed.ok && confirm('この共有に公開済みの大会データがあります。\n\nOK: 公開済みの内容をこの端末に読み込む\nキャンセル: この端末の内容で公開し直す')) {
      setState(parsed.state);
      toast('公開済みの大会データを読み込みました');
    } else {
      await pushNow();
    }
  } else {
    await pushNow();
  }
  emit();
}

function relogin(password) {
  return login({ base: S.cfg.base, code: S.cfg.code, password, role: S.cfg.role }).then((data) => {
    S.cfg = { ...S.cfg, token: data.token, exp: data.expiresAt };
    saveCfg();
    setStatus('ok');
    startPolling();
    if (isAdmin()) pushNow();
  });
}

export function disconnect() {
  const wasViewer = isViewer();
  clearTimeout(pollTimer);
  clearTimeout(pushTimer);
  dirty = false;
  S.cfg = null;
  S.comments = [];
  saveCfg();
  if (wasViewer) leaveViewer();
  setStatus('off');
}

async function closeShare() {
  if (!confirm('共有を終了します。サーバーに置いた大会データとコメントはすべて削除され、閲覧者は見られなくなります。\n（この端末の大会データは残ります）\n\nよろしいですか？')) return;
  await call('DELETE', '');
  disconnect();
  toast('共有を終了しました');
}

// ---- 運営: 送信 ----

export async function pushNow() {
  if (!isAdmin() || S.status === 'auth') return;
  clearTimeout(pushTimer);
  if (pushing) { dirty = true; return; }
  pushing = true;
  dirty = false;
  setStatus('sending');
  try {
    const r = await call('PUT', '/state', { state: getState() });
    S.rev = r.rev;
    S.lastPush = new Date();
    setStatus('ok');
  } catch (e) {
    dirty = true;
    handleError(e, '大会データを送信できませんでした');
  } finally {
    pushing = false;
  }
  if (dirty && S.status === 'ok') schedulePush();
}

function schedulePush() {
  if (!isAdmin() || S.status === 'auth') return;
  dirty = true;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, PUSH_DELAY_MS);
}

// ---- 同期（コメント・閲覧者のデータ更新） ----

function handleError(e, prefix) {
  if (e.status === 401) {
    clearTimeout(pollTimer);
    setStatus('auth', e.message);
    if (isViewer()) openShareDialog();
    else toast('共有の認証が切れました。共有の画面でパスワードを入力してください', { error: true });
  } else if (e.status === 404) {
    const wasViewer = isViewer();
    disconnect();
    toast(wasViewer ? '共有は終了しました' : '共有が見つかりません（終了した可能性があります）', { error: true });
  } else {
    setStatus('error', e.status ? e.message : `${prefix}。${e.message}`);
  }
}

async function pollOnce() {
  if (!S.cfg || S.status === 'auth') return;
  try {
    const r = await call('GET', `/sync?rev=${S.rev}&crev=${S.crev}`);
    S.title = r.title;
    S.updatedAt = r.updatedAt;
    if (r.rev !== S.rev) {
      S.rev = r.rev;
      if (isViewer() && r.state) {
        const parsed = parseState(r.state);
        if (parsed.ok) setRemoteState(parsed.state);
        else toast(`受信した大会データを読み込めませんでした: ${parsed.error}`, { error: true });
      }
    }
    if (r.comments) {
      S.comments = r.comments;
      S.crev = r.crev;
    }
    if (S.status !== 'sending') setStatus('ok');
    else emit();
    if (dirty && isAdmin()) schedulePush();
  } catch (e) {
    handleError(e, '共有サーバーから更新を取得できませんでした');
  }
}

function startPolling() {
  clearTimeout(pollTimer);
  const tick = async () => {
    if (!S.cfg) return;
    if (!document.hidden) await pollOnce();
    if (S.cfg && S.status !== 'auth') pollTimer = setTimeout(tick, POLL_MS);
  };
  pollTimer = setTimeout(tick, POLL_MS);
}

// ---- コメント ----

export async function postComment({ name, text, matchId }) {
  await call('POST', '/comments', { name, text, matchId: matchId || null });
  await pollOnce();
}

export async function deleteComment(id) {
  await call('DELETE', `/comments/${id}`);
  await pollOnce();
}

export { ShareError };

// ---- 共有ダイアログ ----

function field(id, label, attrs = '') {
  return `<label class="sh-field"><span>${label}</span><input id="${id}" ${attrs}></label>`;
}

function statusLine() {
  if (S.status === 'sending') return '送信中…';
  if (S.status === 'error') return `<span class="bad">${h(S.message)}</span>`;
  if (S.status === 'auth') return `<span class="bad">${h(S.message || '認証が切れました')}</span>`;
  const t = (d) => d.toLocaleTimeString('ja-JP');
  if (isAdmin()) return S.lastPush ? `最終送信 ${t(S.lastPush)}（変更は自動で送信されます）` : '共有中';
  return S.updatedAt ? `運営の最終更新 ${t(new Date(S.updatedAt * 1000))}（自動で更新されます）` : '運営がまだ大会データを公開していません';
}

function bodyHtml(prefill) {
  const base = prefill.base ?? defaultBase(location);
  const baseField = field('sh-base', '共有サーバーのURL', `value="${h(base)}" placeholder="https://tournament.○○.workers.dev" autocomplete="url" inputmode="url"`);
  if (S.cfg && S.status === 'auth') {
    return `<p class="bad">${h(S.message || '認証が切れました')}</p>
    <p>共有コード <b class="sh-code">${h(S.cfg.code)}</b> に入り直します。${isAdmin() ? '運営用' : '閲覧用'}パスワードを入力してください。</p>
    ${field('sh-pw', 'パスワード', 'type="password" autocomplete="current-password"')}
    <p class="sh-actions"><button type="button" class="primary" data-sh="relogin">入り直す</button> <button type="button" data-sh="disconnect">共有から切断</button></p>`;
  }
  if (isAdmin()) {
    const link = viewerLink(S.cfg.base, S.cfg.code);
    return `<p class="sh-state">${statusLine()}</p>
    <div class="sh-row"><span>共有コード</span><b class="sh-code">${h(S.cfg.code)}</b></div>
    <div class="sh-row"><span>閲覧リンク</span><input id="sh-link" readonly value="${h(link)}"><button type="button" data-sh="copy">コピー</button></div>
    <p class="hint">閲覧者には、このリンクと<b>閲覧用パスワード</b>を伝えてください（パスワードは安全のため画面には表示されません）。閲覧者はコメントも書けます。</p>
    <p class="sh-actions"><button type="button" class="primary" data-sh="push">今すぐ送信</button></p>
    <details class="sh-details"><summary>パスワードを変更する</summary>
      <div class="sh-pwrow">${field('sh-newv', '新しい閲覧用パスワード', 'type="password" autocomplete="new-password"')}<button type="button" data-sh="pw-viewer">変更</button></div>
      <div class="sh-pwrow">${field('sh-newa', '新しい運営用パスワード', 'type="password" autocomplete="new-password"')}<button type="button" data-sh="pw-admin">変更</button></div>
      <p class="hint">閲覧用を変えると、今見ている人はもう一度パスワードの入力が必要になります。</p>
    </details>
    <p class="sh-actions"><button type="button" data-sh="disconnect">切断（共有は残す）</button> <button type="button" class="danger" data-sh="close">共有を終了（サーバーのデータを削除）</button></p>`;
  }
  if (isViewer()) {
    return `<p class="sh-state">${statusLine()}</p>
    <div class="sh-row"><span>共有コード</span><b class="sh-code">${h(S.cfg.code)}</b></div>
    <p class="hint">閲覧専用です。コメントタブからコメントを書けます。</p>
    <p class="sh-actions"><button type="button" data-sh="disconnect">閲覧をやめる</button></p>`;
  }
  return `<p class="hint">大会データをサーバーに公開し、スマホなどから見られるようにします（閲覧者はコメントも書けます）。共有サーバー（Cloudflare Worker）が必要です。設定は README の「共有機能」を参照してください。</p>
  ${baseField}
  <section class="sh-section"><h3>大会を共有する（運営）</h3>
    ${field('sh-vpw', `閲覧用パスワード（参加者に伝える・${PASSWORD_MIN}文字以上）`, 'type="password" autocomplete="new-password"')}
    ${field('sh-apw', `運営用パスワード（あなた専用・${PASSWORD_MIN}文字以上）`, 'type="password" autocomplete="new-password"')}
    <button type="button" class="primary" data-sh="start">共有を始める</button></section>
  <section class="sh-section"><h3>共有を見る（閲覧）</h3>
    ${field('sh-code', '共有コード', `value="${h(prefill.code || '')}" autocomplete="off" autocapitalize="none" spellcheck="false"`)}
    ${field('sh-vpw2', '閲覧用パスワード', 'type="password" autocomplete="current-password"')}
    <button type="button" class="primary" data-sh="join">見る</button></section>
  <details class="sh-details"><summary>運営として再接続する（別の端末・認証切れ）</summary>
    ${field('sh-code2', '共有コード', 'autocomplete="off" autocapitalize="none" spellcheck="false"')}
    ${field('sh-apw2', '運営用パスワード', 'type="password" autocomplete="current-password"')}
    <button type="button" data-sh="admin">運営として接続</button></details>`;
}

let prefillCache = {};

export function renderShareDialog() {
  const dlg = $('share-dialog');
  if (!dlg.open) return;
  // 入力中の値を失わないよう、接続状態が変わらない更新（状態表示だけ）では本文を作り直さない
  const key = `${S.cfg ? S.cfg.role : 'off'}:${S.cfg?.code ?? ''}:${S.status === 'auth' ? 'auth' : ''}`;
  const body = $('share-body');
  if (body.dataset.key !== key) {
    body.innerHTML = bodyHtml(prefillCache);
    body.dataset.key = key;
  } else {
    const line = body.querySelector('.sh-state');
    if (line) line.innerHTML = statusLine();
  }
}

export function openShareDialog(prefill = {}) {
  prefillCache = prefill;
  const dlg = $('share-dialog');
  $('share-body').dataset.key = '';
  $('sh-error').textContent = '';
  if (!dlg.open) dlg.showModal();
  renderShareDialog();
}

function readBase() {
  const r = normalizeBase($('sh-base')?.value);
  if (!r.ok) throw new ShareError(0, r.error);
  if (!r.base) throw new ShareError(0, '共有サーバーのURLを入力してください');
  return r.base;
}

const val = (id) => $(id)?.value ?? '';

async function onAction(act, btn) {
  if (act === 'start') {
    const viewerPassword = val('sh-vpw');
    const adminPassword = val('sh-apw');
    if (viewerPassword.length < PASSWORD_MIN || adminPassword.length < PASSWORD_MIN) throw new ShareError(0, `パスワードは${PASSWORD_MIN}文字以上で入力してください`);
    if (viewerPassword === adminPassword) throw new ShareError(0, '閲覧用と運営用には別のパスワードを使ってください');
    await startShare({ base: readBase(), viewerPassword, adminPassword });
    toast('共有を始めました');
  } else if (act === 'join') {
    const code = normalizeCode(val('sh-code'));
    if (!code) throw new ShareError(0, '共有コードは8文字です。入力を確認してください');
    if (getState().players.length || getState().tournament || getState().league) {
      if (!confirm('共有を見ている間は、この端末の大会データは表示されません（閲覧をやめると元に戻ります。データは消えません）。\n続けますか？')) return;
    }
    await joinViewer({ base: readBase(), code, password: val('sh-vpw2') });
  } else if (act === 'admin') {
    const code = normalizeCode(val('sh-code2'));
    if (!code) throw new ShareError(0, '共有コードは8文字です。入力を確認してください');
    await joinAdmin({ base: readBase(), code, password: val('sh-apw2') });
  } else if (act === 'relogin') {
    await relogin(val('sh-pw'));
  } else if (act === 'push') {
    await pushNow();
    if (S.status === 'error') throw new ShareError(0, S.message);
    toast('送信しました');
  } else if (act === 'copy') {
    const link = $('sh-link');
    link.select();
    try { await navigator.clipboard.writeText(link.value); toast('閲覧リンクをコピーしました'); } catch { toast('リンクを選択しました。コピーしてください'); }
  } else if (act === 'pw-viewer' || act === 'pw-admin') {
    const role = act === 'pw-admin' ? 'admin' : 'viewer';
    const password = val(role === 'admin' ? 'sh-newa' : 'sh-newv');
    if (password.length < PASSWORD_MIN) throw new ShareError(0, `パスワードは${PASSWORD_MIN}文字以上で入力してください`);
    const r = await call('PUT', '/passwords', { role, password });
    S.cfg = { ...S.cfg, token: r.token, exp: r.expiresAt };
    saveCfg();
    $(role === 'admin' ? 'sh-newa' : 'sh-newv').value = '';
    toast(`${role === 'admin' ? '運営用' : '閲覧用'}パスワードを変更しました`);
  } else if (act === 'disconnect') {
    disconnect();
    toast('共有から切断しました');
  } else if (act === 'close') {
    await closeShare();
  }
  btn.blur();
}

export function setupShareDialog() {
  const dlg = $('share-dialog');
  $('sh-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-sh]');
    if (!btn || btn.disabled) return;
    $('sh-error').textContent = '';
    btn.disabled = true;
    try {
      await onAction(btn.dataset.sh, btn);
    } catch (err) {
      $('sh-error').textContent = err.message;
    } finally {
      btn.disabled = false;
      // 接続状態が変わっていれば本文を作り直す
      renderShareDialog();
    }
  });
  onShareChange(renderShareDialog);
}

// ---- 起動時 ----

export function initShare() {
  onSaved(schedulePush);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.cfg) pollOnce(); });
  window.addEventListener('online', () => { if (S.cfg) pollOnce(); });

  const saved = loadCfg();
  const hashCode = codeFromHash(location.hash);
  if (hashCode) history.replaceState(null, '', location.pathname + location.search);

  if (saved) {
    S.cfg = saved;
    if (isViewer()) enterViewer();
    if (saved.exp * 1000 < Date.now()) {
      S.status = 'auth';
      S.message = '前回のログインの有効期限が切れました';
      if (isViewer()) setTimeout(openShareDialog, 0);
    } else {
      S.status = 'ok';
      startPolling();
      pollOnce();
    }
    emit();
  } else if (hashCode) {
    setTimeout(() => openShareDialog({ code: hashCode }), 0);
  }
}
