import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { generateTournament, setTournamentResult, resolveBracket, THIRD_PLACE_ID } from '../../src/core/bracket.js';
import { tournamentResultRows } from '../../src/core/exportData.js';
import { roundKeys, defaultRoundKey, pickRoundKey, pickKey, rowsForRound, roundTabsHtml, roundViewHtml, roundPanelHtml, THIRD_KEY } from '../../src/ui/roundView.js';
import { generateLeague, resolveLeague } from '../../src/core/league.js';
import { leagueResultRows } from '../../src/core/exportData.js';
import { leagueRoundKeys, defaultLeagueRoundKey } from '../../src/core/leagueRounds.js';

function make(n, opts = {}) {
  const st = createState();
  st.players = makePlayers(Array.from({ length: n }, (_, i) => `選手${i + 1}`));
  st.tournament = generateTournament(st.players.map((p) => p.id), opts);
  return st;
}
const play = (st, id, outcome = 'p1') => { st.tournament = setTournamentResult(st.tournament, id, { outcome }).tournament; };

test('回戦のタブ: 1回戦…決勝。3位決定戦があれば最後に加わる', () => {
  const st = make(8);
  assert.deepEqual(roundKeys(resolveBracket(st.tournament, st.tables)), [
    { key: '1', name: '準々決勝' }, { key: '2', name: '準決勝' }, { key: '3', name: '決勝' },
  ]);
  const st3 = make(8, { thirdPlace: true });
  assert.deepEqual(roundKeys(resolveBracket(st3.tournament, st3.tables)).at(-1), { key: THIRD_KEY, name: '3位決定戦' });
});

test('最初に開く回戦: 試合待ちがある最初の回戦。全部終われば決勝', () => {
  const st = make(8, { thirdPlace: true });
  const res = () => resolveBracket(st.tournament, st.tables);
  assert.equal(defaultRoundKey(res()), '1');
  for (const id of ['R1-M1', 'R1-M2', 'R1-M3', 'R1-M4']) play(st, id);
  assert.equal(defaultRoundKey(res()), '2');
  play(st, 'R2-M1');
  assert.equal(defaultRoundKey(res()), '2'); // まだ準決勝の1試合が残っている
  play(st, 'R2-M2');
  // 決勝と3位決定戦が試合待ち → 決勝（3回戦）が先
  assert.equal(defaultRoundKey(res()), '3');
  play(st, 'R3-M1');
  assert.equal(defaultRoundKey(res()), THIRD_KEY);
  play(st, THIRD_PLACE_ID);
  assert.equal(defaultRoundKey(res()), '3'); // 全部終わったら決勝
});

test('選んだ回戦: 無効な値のときは最初に開く回戦に戻る', () => {
  const st = make(8);
  const res = resolveBracket(st.tournament, st.tables);
  const keys = roundKeys(res);
  assert.equal(pickRoundKey('2', keys, res), '2');
  assert.equal(pickRoundKey('9', keys, res), '1');
  assert.equal(pickRoundKey(null, keys, res), '1');
  assert.equal(pickRoundKey(THIRD_KEY, keys, res), '1'); // 3位決定戦が無いとき
});

test('回戦ごとの試合: 試合結果一覧の行から、その回戦の試合だけを選ぶ（3位決定戦は別）', () => {
  const st = make(12, { thirdPlace: true });
  const rows = tournamentResultRows(st);
  const counts = Object.fromEntries(['1', '2', '3', '4', THIRD_KEY].map((k) => [k, rowsForRound(rows, k).length]));
  assert.deepEqual(counts, { 1: 8, 2: 4, 3: 2, 4: 1, third: 1 }); // 16枠: 1回戦8（うち不戦4）…
  assert.ok(rowsForRound(rows, '4').every(({ match }) => !match.isThirdPlace));
  assert.ok(rowsForRound(rows, THIRD_KEY).every(({ match }) => match.isThirdPlace));
});

test('タブとカード: 選んだタブだけ aria-selected、カードは選んだ回戦の試合。名前は HTML として解釈されない', () => {
  const html = roundTabsHtml([{ key: '1', name: '準決勝' }, { key: '2', name: '決勝' }], '2');
  assert.match(html, /role="tablist"/);
  assert.match(html, /data-round-tab="1" aria-selected="false">準決勝</);
  assert.match(html, /data-round-tab="2" aria-selected="true">決勝</);
  const st = make(4);
  st.players[0].name = '<b>太郎</b>';
  const res = resolveBracket(st.tournament, st.tables);
  const view = roundViewHtml(res, tournamentResultRows(st), '1');
  assert.equal((view.match(/<li>/g) || []).length, 2); // 準決勝の2試合
  assert.ok(view.includes('aria-label="準決勝の試合"'));
  assert.match(view, /data-match="R1-M1"/);
  assert.ok(!view.includes('<b>太郎</b>'));
  // 決勝の回戦を選ぶと、決勝の1試合
  assert.equal((roundViewHtml(res, tournamentResultRows(st), '2').match(/<li>/g) || []).length, 1);
});

test('回戦の選び方は共通: 選んだキーが無ければ代わりのキー。トーナメントの pickRoundKey も同じ結果', () => {
  const keys = [{ key: '1', name: '1回戦' }, { key: '2', name: '2回戦' }];
  assert.equal(pickKey('2', keys, '1'), '2');
  assert.equal(pickKey('9', keys, '1'), '1');
  assert.equal(pickKey(null, keys, '1'), '1');
  const st = make(8);
  const res = resolveBracket(st.tournament, st.tables);
  assert.equal(pickRoundKey('9', roundKeys(res), res), defaultRoundKey(res));
});

test('総当たりの回戦ごとの表示: 回戦のタブと、その回戦の試合のカードだけが出る', () => {
  const st = createState();
  st.players = makePlayers(Array.from({ length: 4 }, (_, i) => `選手${i + 1}`));
  st.league = generateLeague(st.players.map((p) => p.id));
  const res = resolveLeague(st.league, st.tables);
  const rows = leagueResultRows(st);
  const html = roundPanelHtml({ keys: leagueRoundKeys(res), key: defaultLeagueRoundKey(res), rows, isClickable: () => true, footer: '<p class="round-rest">休み：X</p>' });
  assert.equal((html.match(/data-round-tab=/g) || []).length, 3); // 3回戦
  assert.match(html, /data-round-tab="1" aria-selected="true"/);
  assert.equal((html.match(/data-match=/g) || []).length, 2); // 4人の1回戦は2試合
  assert.match(html, /aria-label="1回戦の試合"/);
  assert.ok(html.endsWith('<p class="round-rest">休み：X</p>')); // 休みの行はカードの下
  // 2回戦を選ぶと、2回戦の試合になる
  const second = roundPanelHtml({ keys: leagueRoundKeys(res), key: '2', rows, isClickable: () => true });
  assert.match(second, /data-round-tab="2" aria-selected="true"/);
  const ids2 = res.matches.filter((m) => m.round === 2).map((m) => m.id);
  for (const id of ids2) assert.ok(second.includes(`data-match="${id}"`));
});
