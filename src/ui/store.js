// 大会データの保持と自動保存（localStorage）

import { createState, parseState, serializeState } from '../core/state.js';

const KEY = 'bukatsu-taikai:state';
let state = null;
const listeners = new Set();
let statusCb = () => {};

export function getState() {
  return state;
}

/**
 * 状態を置き換える。
 * @param {object} next
 * @param {{render?:boolean}} opts render:false なら画面を再描画しない（入力中のフォーカスを保つため）
 */
export function setState(next, { render = true } = {}) {
  state = { ...next, meta: { ...next.meta, updatedAt: new Date().toISOString() } };
  persist();
  if (render) listeners.forEach((f) => f());
}

export function onChange(f) {
  listeners.add(f);
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
