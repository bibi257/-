import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, parseState, serializeState, playerName } from '../../src/core/state.js';
import { makePlayers, validatePlayers, resizeTables, movePlayer, nameKey } from '../../src/core/players.js';
import { generateTournament, setTournamentResult } from '../../src/core/bracket.js';
import { generateLeague } from '../../src/core/league.js';
import { normalizeResultInput } from '../../src/core/result.js';

test('保存→読込で同じ内容に戻る', () => {
  const st = createState();
  st.players = makePlayers(['山田', '佐藤', '鈴木']);
  st.tournament = generateTournament(st.players.map((p) => p.id), { seedCount: 1 });
  st.tournament = setTournamentResult(st.tournament, 'R1-M2', { score1: 3, score2: 1 }).tournament;
  st.league = generateLeague(st.players.map((p) => p.id));
  const r = parseState(serializeState(st));
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.state.players, st.players);
  assert.deepEqual(r.state.tournament, st.tournament);
  assert.deepEqual(r.state.league, st.league);
  assert.ok(r.state.meta.updatedAt);
});

test('不正なデータは読み込まない', () => {
  assert.equal(parseState('{abc').ok, false);
  assert.equal(parseState('[]').ok, false);
  assert.equal(parseState({ kind: 'other' }).ok, false);
  const st = createState();
  assert.equal(parseState({ ...st, version: 99 }).ok, false);
  assert.equal(parseState({ ...st, players: [{ id: 1 }] }).ok, false);
  assert.equal(parseState({ ...st, tables: [] }).ok, false);
  assert.equal(parseState({ ...st, tournament: { size: 3, slots: [], playerIds: [], results: {} } }).ok, false);
  assert.equal(parseState({ ...st, league: { matches: 'x' } }).ok, false);
  const r = parseState('{abc');
  assert.match(r.error, /JSON/);
});

test('足りない設定項目は既定値で補う', () => {
  const st = createState();
  delete st.settings.league;
  const r = parseState(JSON.stringify(st));
  assert.ok(r.ok);
  assert.equal(r.state.settings.league.win, 3);
});

test('名簿チェック: 空欄・重複（全角半角・空白の違いも重複）', () => {
  const ps = makePlayers(['山田 太郎', '', '山田太郎', 'ＡＢＣ', 'abc']);
  const { errors, invalidIds } = validatePlayers(ps);
  assert.equal(errors.length, 3);
  assert.ok(invalidIds.has(ps[1].id));
  assert.ok(invalidIds.has(ps[2].id));
  assert.ok(invalidIds.has(ps[4].id));
  assert.equal(nameKey('Ａ　B'), 'ab');
});

test('卓数の変更で既存の卓名を残す', () => {
  let t = resizeTables([], 2);
  t[0].name = 'A卓';
  t = resizeTables(t, 4);
  assert.equal(t.length, 4);
  assert.equal(t[0].name, 'A卓');
  assert.equal(t[3].name, '第4卓');
  assert.equal(resizeTables(t, 0).length, 1);
  assert.equal(resizeTables(t, 999).length, 50);
});

test('並べ替え', () => {
  const ps = makePlayers(['a', 'b', 'c']);
  assert.deepEqual(movePlayer(ps, 0, 1).map((p) => p.name), ['b', 'a', 'c']);
  assert.equal(movePlayer(ps, 0, -1), ps);
});

test('参加者名の表示: 不戦・未定・削除済み', () => {
  const st = createState();
  st.players = makePlayers(['山田']);
  assert.equal(playerName(st, st.players[0].id), '山田');
  assert.equal(playerName(st, null), '（不戦）');
  assert.equal(playerName(st, undefined), '');
  assert.equal(playerName(st, 'zzz'), '（削除された参加者）');
});

test('結果入力チェック', () => {
  const ok = (i, d = false) => normalizeResultInput(i, { allowDraw: d });
  assert.equal(ok({}).ok, false);
  assert.equal(ok({ walkover: true }).ok, false);
  assert.deepEqual(ok({ walkover: true, outcome: 'p2', score1: 3, score2: 0 }).value, { outcome: 'p2', score1: null, score2: null, walkover: true });
  assert.equal(ok({ score1: '1.5', score2: 0 }).ok, false);
  assert.equal(ok({ score1: 'a', score2: 0 }).ok, false);
  assert.equal(ok({ score1: 10000, score2: 0 }).ok, false);
  assert.equal(ok({ score1: ' 3 ', score2: '1' }).value.outcome, 'p1');
  assert.equal(ok({ outcome: 'draw' }, true).value.outcome, 'draw');
});
