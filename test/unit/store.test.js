import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serializeState } from '../../src/core/state.js';

// 自動保存（localStorage）の差し替え。null のときは使えない環境（プライベートモード等）を再現する
let storage = null;
const KEY = 'bukatsu-taikai:state';
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  get() {
    if (!storage) throw new Error('localStorage is disabled');
    return {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    };
  },
});
const store = await import('../../src/ui/store.js');

const named = (name) => ({ ...createState(), players: [{ id: 'p1', name }] });

/** 閲覧を始めて、閲覧をやめるまでの流れ（共有の画面と同じ順序） */
function viewAndLeave(mutateWhileViewing) {
  store.setReadOnly(true);
  store.setRemoteState(named('他校'));
  store.setState(named('閲覧中の操作')); // 閲覧中の操作は反映されない
  mutateWhileViewing?.();
  store.setReadOnly(false);
  store.reloadLocal();
  return store.getState().players[0].name;
}

test('自動保存が使えないとき、閲覧をやめると閲覧前の自分の大会データに戻る', () => {
  storage = null;
  assert.equal(store.initState(), false);
  store.setState(named('山田'));
  assert.equal(viewAndLeave(), '山田');
});

test('別のタブで新しく保存された内容があれば、閲覧をやめたときにそれを使う（古い複製で上書きしない）', () => {
  storage = new Map();
  store.initState();
  store.setState(named('山田'));
  // 閲覧を始めたあと、別のタブで同じ端末の大会データが更新された
  assert.equal(viewAndLeave(() => storage.set(KEY, serializeState(named('佐藤')))), '佐藤');
});
