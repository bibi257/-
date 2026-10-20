import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCallView, callViewUrl, callViewKind } from '../../src/core/callView.js';

test('?view=call のページだけを、呼び出し画面のウィンドウと見なす', () => {
  assert.deepEqual(parseCallView('?view=call'), { kind: null });
  assert.deepEqual(parseCallView('?view=call&kind=league'), { kind: 'league' });
  assert.deepEqual(parseCallView('?kind=tournament&view=call'), { kind: 'tournament' });
  assert.equal(parseCallView(''), null);
  assert.equal(parseCallView('?view=other'), null);
  assert.equal(parseCallView('?kind=league'), null);
  assert.equal(parseCallView(undefined), null);
});

test('種類が不正なときは指定なし（null）にする', () => {
  assert.deepEqual(parseCallView('?view=call&kind=x'), { kind: null });
});

test('別ウィンドウの URL: 今のページに view と kind を付け、ほかの検索・#以降は引き継がない', () => {
  assert.equal(callViewUrl('https://example.com/app/index.html?code=abc#x', 'tournament'),
    'https://example.com/app/index.html?view=call&kind=tournament');
  assert.equal(callViewUrl('file:///C:/app/web/index.html', 'league'), 'file:///C:/app/web/index.html?view=call&kind=league');
  assert.equal(callViewUrl('https://example.com/', undefined), 'https://example.com/?view=call');
});

test('呼び出し画面の種類: 指定が無ければ、トーナメントがあればトーナメント、なければ総当たり', () => {
  assert.equal(callViewKind('league', { tournament: {} }), 'league');
  assert.equal(callViewKind(null, { tournament: {} }), 'tournament');
  assert.equal(callViewKind(null, { tournament: null }), 'league');
});
