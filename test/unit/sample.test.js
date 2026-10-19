import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, parseState, serializeState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { resolveBracket } from '../../src/core/bracket.js';
import { sampleState, SAMPLE_TITLE, SAMPLE_NAMES } from '../../src/core/sample.js';
import { emptyGuide } from '../../src/core/guide.js';

test('サンプル: 架空の8人と卓2つを入れ、大会名を「サンプル大会」にして、トーナメント表を作る', () => {
  const r = sampleState(createState());
  assert.equal(r.ok, true);
  const st = r.state;
  assert.equal(st.meta.title, SAMPLE_TITLE);
  assert.equal(SAMPLE_TITLE, 'サンプル大会');
  assert.deepEqual(st.players.map((p) => p.name), SAMPLE_NAMES);
  assert.equal(st.players.length, 8);
  assert.equal(st.tables.length, 2);
  assert.equal(st.league, null);
  assert.equal(st.tournament.playerIds.length, 8);
  const res = resolveBracket(st.tournament, st.tables);
  assert.equal(res.playable.length, 7);
  assert.equal(new Set(st.players.map((p) => p.id)).size, 8);
});

test('サンプル: 保存・読込できる。元の大会データは変えない', () => {
  const base = createState();
  const r = sampleState(base);
  assert.equal(base.players.length, 0);
  assert.equal(base.tournament, null);
  const back = parseState(serializeState(r.state));
  assert.ok(back.ok, back.error);
  assert.equal(back.state.players.length, 8);
});

test('サンプル: 参加者がいるときは作らない（今の名簿を消さない）', () => {
  const st = createState();
  st.players = makePlayers(['A', 'B']);
  const r = sampleState(st);
  assert.equal(r.ok, false);
  assert.match(r.error, /参加者がいる/);
});

test('サンプル: 卓名・設定・過去の大会はそのまま。卓は2つにそろえる', () => {
  const st = createState();
  st.tables = [{ id: 't1', name: 'A卓' }, { id: 't2', name: 'B卓' }, { id: 't3', name: 'C卓' }];
  st.settings = { ...st.settings, thirdPlace: true };
  st.history = [];
  const r = sampleState(st);
  assert.deepEqual(r.state.tables.map((t) => t.name), ['A卓', 'B卓']);
  assert.equal(r.state.settings.thirdPlace, true);
  assert.equal(r.state.tournament.thirdPlace, true);
});

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
  assert.match(emptyGuide('tournament', some).text, /^トーナメント表はまだ作成されていません。「参加者・設定」で「トーナメント表を作成」を押してください。$/);
  assert.match(emptyGuide('league', some).text, /^総当たり表はまだ作成されていません。「参加者・設定」で「総当たり表を作成」を押してください。$/);
  assert.match(emptyGuide('standings', some).text, /^表を作成すると、ここに順位表が表示されます。/);
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
