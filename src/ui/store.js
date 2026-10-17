// 大会データの保持と自動保存（localStorage）

import { createState, parseState, serializeState } from '../core/state.js';

const KEY = 'bukatsu-taikai:state';
let state = null;
const listeners = new Set();
let statusCb = () => {};
let readOnly = false;
let localBackup = null; // 閲覧を始める前の自分の大会データ（自動保存が使えない環境でも閲覧後に戻すため）
const savedListeners = new Set();

export function getState() {
  return state;
}

/**
 * 状態を置き換える。
 * @param {object} next
 * @param {{render?:boolean}} opts render:false なら画面を再描画しない（入力中のフォーカスを保つため）
 */
export function setState(next, { render = true } = {}) {
  if (readOnly) return; // 閲覧専用（共有を見ている間）は、操作で内容を変えない
  state = { ...next, meta: { ...next.meta, updatedAt: new Date().toISOString() } };
  persist();
  if (render) listeners.forEach((f) => f());
}

export function onChange(f) {
  listeners.add(f);
}

/** 保存のたびに呼ばれる（共有の自動送信用。render:false の入力でも呼ばれる） */
export function onSaved(f) {
  savedListeners.add(f);
}

export function isReadOnly() {
  return readOnly;
}

export function setReadOnly(flag) {
  if (flag && !readOnly) localBackup = state;
  readOnly = flag;
}

/** 閲覧中に受け取った大会データを表示する。この端末の自動保存は上書きしない */
export function setRemoteState(next) {
  state = next;
  listeners.forEach((f) => f());
}

/** 閲覧をやめたとき、この端末に保存してあった自分の大会データへ戻す */
export function reloadLocal() {
  state = localBackup;
  localBackup = null;
  if (!state) initState();
  listeners.forEach((f) => f());
}

export function onSaveStatus(cb) {
  statusCb = cb;
}

function persist() {
  try {
    localStorage.setItem(KEY, serializeState(state));
    statusCb({ ok: true, at: new Date() });
  } catch {
    statusCb({ ok: false });
  }
  savedListeners.forEach((f) => f());
}

/** 自動保存から復元。なければ新規 */
export function initState() {
  let restored = false;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const r = parseState(raw);
      if (r.ok) { state = r.state; restored = true; }
    }
  } catch {
    // localStorage が使えない環境（プライベートモード等）
  }
  if (!state) state = createState();
  return restored;
}
