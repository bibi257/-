import { test } from 'node:test';
import assert from 'node:assert/strict';

// 自動保存（localStorage）が使えない環境を再現する。store.js はモジュール読み込み時には localStorage を触らない
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  get() { throw new Error('localStorage is disabled'); },
});
const store = await import('../../src/ui/store.js');
const { createState } = await import('../../src/core/state.js');

test('自動保存が使えなくても、閲覧をやめると閲覧前の自分の大会データに戻る', () => {
  assert.equal(store.initState(), false);
  const mine = { ...createState(), players: [{ id: 'p1', name: '山田' }] };
  store.setState(mine);
  assert.equal(store.getState().players[0].name, '山田');

  // 閲覧を始める（共有の画面と同じ順序）
  store.setReadOnly(true);
  store.setRemoteState({ ...createState(), players: [{ id: 'x1', name: '他校' }] });
  store.setState(createState()); // 閲覧中の操作は反映されない
  assert.equal(store.getState().players[0].name, '他校');

  // 閲覧をやめる
  store.setReadOnly(false);
  store.reloadLocal();
  assert.equal(store.getState().players[0].name, '山田');
});
