import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePlayers } from '../../src/core/players.js';
import { emptyGuide } from '../../src/core/guide.js';

test('案内: 表が無い画面は、次にすることを1文で示し、移動ボタンを付ける', () => {
  const none = { players: [] };
  const some = { players: makePlayers(['A', 'B', 'C']) };
  const one = { players: makePlayers(['A']) };
  for (const kind of ['tournament', 'league', 'standings']) {
    for (const st of [none, one]) {
      const g = emptyGuide(kind, st);
      assert.match(g.text, /まず参加者を2人以上入力しましょう/);
      assert.deepEqual(g.button, { label: '参加者を入力する', goto: 'setup' });
    }
    const g = emptyGuide(kind, some);
    assert.deepEqual(g.button, { label: '表を作成する', goto: 'setup' });
  }
  assert.equal(emptyGuide('tournament', some).text, 'トーナメント表はまだ作成されていません。「参加者・設定」で「トーナメント表を作成」を押してください。');
  assert.equal(emptyGuide('league', some).text, '総当たり表はまだ作成されていません。「参加者・設定」で「総当たり表を作成」を押してください。');
  assert.equal(emptyGuide('standings', some).text, '表を作成すると、ここに順位表が表示されます。「参加者・設定」で、トーナメント表か総当たり表を作成しましょう。');
});

test('案内: 大会データが無い・名簿が無くても、例外にならない', () => {
  assert.match(emptyGuide('tournament', null).text, /まず参加者を2人以上入力しましょう/);
  assert.match(emptyGuide('league', {}).text, /まず参加者を2人以上入力しましょう/);
});

test('案内: 閲覧専用（共有の閲覧者・過去の大会）では、ボタンを付けず、運営が作るのを待つ旨にする', () => {
  const st = { players: makePlayers(['A', 'B']) };
  for (const kind of ['tournament', 'league']) {
    const g = emptyGuide(kind, st, { readOnly: true });
    assert.equal(g.button, null);
    assert.match(g.text, /まだ作成されていません。運営が作成するまでお待ちください/);
  }
  assert.equal(emptyGuide('standings', st, { readOnly: true }).button, null);
});
