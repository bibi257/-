import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { generateTournament, setTournamentResult, setTournamentStarted } from '../../src/core/bracket.js';
import { generateLeague, resolveLeague, setLeagueResult } from '../../src/core/league.js';
import { setAbsent } from '../../src/core/attendance.js';
import { describeChange, DEFAULT_LABEL } from '../../src/core/undoLabel.js';
import { createUndo, recordChange, popUndo, undoLabel, MAX_UNDO } from '../../src/core/undo.js';

function sample(n = 4) {
  const st = createState();
  st.players = makePlayers(Array.from({ length: n }, (_, i) => `選手${i + 1}`));
  const ids = st.players.map((p) => p.id);
  st.tournament = generateTournament(ids, { seedCount: 0, shuffle: false });
  st.league = generateLeague(ids);
  return st;
}

test('操作の名前: トーナメントの結果の保存・取消は、試合番号つき', () => {
  const st = sample(4);
  const saved = { ...st, tournament: setTournamentResult(st.tournament, 'R1-M1', { outcome: 'p1' }).tournament };
  assert.equal(describeChange(st, saved), '結果の保存（No.1）');
  const second = { ...saved, tournament: setTournamentResult(saved.tournament, 'R1-M2', { outcome: 'p2' }).tournament };
  assert.equal(describeChange(saved, second), '結果の保存（No.2）');
  const cleared = { ...saved, tournament: setTournamentResult(saved.tournament, 'R1-M1', null).tournament };
  assert.equal(describeChange(saved, cleared), '結果の取消（No.1）');
});

test('操作の名前: 総当たりの結果の保存・取消', () => {
  const st = sample(4);
  const m = resolveLeague(st.league, st.tables).matches[2];
  const saved = { ...st, league: setLeagueResult(st.league, m.id, { outcome: 'p1' }).league };
  assert.equal(describeChange(st, saved), `結果の保存（No.${m.no}）`);
  const cleared = { ...saved, league: setLeagueResult(saved.league, m.id, null).league };
  assert.equal(describeChange(saved, cleared), `結果の取消（No.${m.no}）`);
});

test('操作の名前: 試合の開始・開始の取り消し', () => {
  const st = sample(4);
  const started = { ...st, tournament: setTournamentStarted(st.tournament, 'R1-M2', '2026-10-20T00:00:00.000Z').tournament };
  assert.equal(describeChange(st, started), '試合の開始（No.2）');
  const undone = { ...started, tournament: setTournamentStarted(started.tournament, 'R1-M2', null).tournament };
  assert.equal(describeChange(started, undone), '開始の取り消し（No.2）');
});

test('操作の名前: 結果を保存すると開始も消えるが、名前は「結果の保存」', () => {
  const st = sample(4);
  const started = { ...st, tournament: setTournamentStarted(st.tournament, 'R1-M1', '2026-10-20T00:00:00.000Z').tournament };
  const saved = { ...started, tournament: setTournamentResult(started.tournament, 'R1-M1', { outcome: 'p1' }).tournament };
  assert.equal(describeChange(started, saved), '結果の保存（No.1）');
});

test('操作の名前: 表の作成・卓の変更・参加者・出欠・設定・大会名', () => {
  const st = sample(4);
  assert.equal(describeChange({ ...st, tournament: null }, st), '表の作成');
  assert.equal(describeChange(st, { ...st, league: null }), '表の削除');
  assert.equal(describeChange(st, { ...st, tournament: { ...st.tournament, tableOverrides: { 'R1-M1': 't2' } } }), '卓の変更');
  assert.equal(describeChange(st, { ...st, tables: st.tables.slice(0, 1) }), '卓の変更');
  assert.equal(describeChange(st, { ...st, players: [...st.players, { id: 'x', name: '新人' }] }), '参加者の変更');
  assert.equal(describeChange(st, { ...st, players: setAbsent(st.players, st.players[0].id, true) }), '出欠の変更');
  assert.equal(describeChange(st, { ...st, settings: { ...st.settings, league: { ...st.settings.league, allowDraw: !st.settings.league.allowDraw } } }), '設定の変更');
  assert.equal(describeChange(st, { ...st, meta: { ...st.meta, title: '春季大会' } }), '大会名・開催日時の変更');
});

test('操作の名前: 内容が同じ・前がない・壊れた値は「直前の操作」（例外にしない）', () => {
  const st = sample(4);
  assert.equal(describeChange(st, st), DEFAULT_LABEL);
  assert.equal(describeChange(null, st), DEFAULT_LABEL);
  assert.equal(describeChange(st, null), DEFAULT_LABEL);
  assert.equal(describeChange({ ...st, tournament: { ...st.tournament, results: { zzz: { winnerId: 'a' } } } }, st), '結果の取消');
});

test('履歴: 戻る操作の名前を、新しいものから順に持つ。戻すと次の名前になる。20件を超えると古い名前から捨てる', () => {
  const a = { meta: { updatedAt: '' }, n: 1 };
  const b = { meta: { updatedAt: '' }, n: 2 };
  const c = { meta: { updatedAt: '' }, n: 3 };
  let h = createUndo();
  assert.equal(undoLabel(h), '');
  h = recordChange(h, a, b, { label: '参加者の変更' });
  h = recordChange(h, b, c, { label: '結果の保存（No.1）' });
  assert.equal(undoLabel(h), '結果の保存（No.1）');
  const r = popUndo(h);
  assert.equal(r.state, b);
  assert.equal(undoLabel(r.history), '参加者の変更');
  assert.equal(undoLabel(popUndo(r.history).history), '');
  // 入力のまとめ（merge）は、最初の操作の名前のまま
  let m = createUndo();
  m = recordChange(m, a, b, { merge: true, now: 1000, label: '参加者の変更' });
  m = recordChange(m, b, c, { merge: true, now: 1500, label: '別の名前' });
  assert.equal(undoLabel(m), '参加者の変更');
  // 上限
  let big = createUndo();
  for (let i = 0; i < MAX_UNDO + 5; i++) big = recordChange(big, { meta: { updatedAt: '' }, n: i }, { meta: { updatedAt: '' }, n: i + 1 }, { label: `操作${i}` });
  assert.equal(big.stack.length, MAX_UNDO);
  assert.equal(big.labels.length, MAX_UNDO);
  assert.equal(undoLabel(big), `操作${MAX_UNDO + 4}`);
});
