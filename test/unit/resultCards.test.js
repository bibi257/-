import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { generateTournament, setTournamentResult } from '../../src/core/bracket.js';
import { generateLeague, setLeagueResult } from '../../src/core/league.js';
import { tournamentResultRows, leagueResultRows } from '../../src/core/exportData.js';
import { resultCardsHtml } from '../../src/ui/resultCards.js';

function tournamentState(n, names) {
  const st = createState();
  st.players = makePlayers(names ?? Array.from({ length: n }, (_, i) => `選手${i + 1}`));
  st.tournament = generateTournament(st.players.map((p) => p.id), {});
  return st;
}

test('カード: 1試合1枚。番号・回戦・卓、スコア、状態のバッジ、勝者は太字', () => {
  const st = tournamentState(4);
  st.tournament = setTournamentResult(st.tournament, 'R1-M1', { score1: 3, score2: 1 }).tournament;
  const rows = tournamentResultRows(st);
  const html = resultCardsHtml(rows, (m) => m.playable);
  assert.equal((html.match(/<li>/g) || []).length, rows.length);
  assert.match(html, /No\.1 ・ 準決勝 ・ 第1卓/);
  assert.match(html, /<span class="rc-p rc-win"[^>]*>選手1<\/span><span class="rc-score">3 － 1<\/span><span class="rc-p"[^>]*>選手4<\/span>/);
  assert.match(html, /<span class="badge badge-done">終了<\/span>/);
  assert.match(html, /<span class="badge badge-ready">試合待ち<\/span>/); // 準決勝の2試合目
  assert.match(html, /<span class="rc-score">vs<\/span>/); // 結果の無い試合
});

test('カード: 不戦は1行（「◯◯ 不戦で勝ち上がり」）。押せない試合は data-match を持たない', () => {
  const st = tournamentState(3); // 4枠のうち1つが不戦
  const rows = tournamentResultRows(st);
  const html = resultCardsHtml(rows, (m) => m.playable);
  const bye = html.match(/<li>[^]*?<\/li>/g).find((li) => li.includes('badge-bye'));
  assert.ok(bye);
  assert.match(bye, /rc-bye/);
  assert.match(bye, /不戦で勝ち上がり/);
  assert.ok(!bye.includes('data-match')); // 結果は入力できない
  assert.ok(!bye.includes('rc-score')); // スコアの行は出さない
  assert.match(html, /<button type="button" class="rc st-ready clickable" data-match="R1-M2">/);
});

test('カード: 対戦者未定は「（未定）」、名前は HTML として解釈されない', () => {
  const st = tournamentState(4, ['<b>太郎</b>', '佐藤', '鈴木', '高橋']);
  const html = resultCardsHtml(tournamentResultRows(st), (m) => m.playable);
  assert.match(html, /（未定）/);
  assert.match(html, /badge-waiting/);
  assert.ok(!html.includes('<b>太郎</b>'));
  assert.match(html, /&lt;b&gt;太郎&lt;\/b&gt;/);
});

test('カード（総当たり）: 勝った側が太字、引き分けは誰も太字にならない', () => {
  const st = createState();
  st.players = makePlayers(['A', 'B', 'C']);
  st.league = generateLeague(st.players.map((p) => p.id));
  const [m1, m2] = st.league.matches;
  st.league = setLeagueResult(st.league, m1.id, { score1: 1, score2: 3 }).league;
  st.league = setLeagueResult(st.league, m2.id, { score1: 2, score2: 2 }).league;
  const cards = resultCardsHtml(leagueResultRows(st)).match(/<li>[^]*?<\/li>/g);
  assert.match(cards[0], /<span class="rc-p"[^>]*>[ABC]<\/span><span class="rc-score">1 － 3<\/span><span class="rc-p rc-win"[^>]*>[ABC]<\/span>/);
  assert.match(cards[1], /2 － 2/);
  assert.ok(!cards[1].includes('rc-win'));
  assert.equal(cards.filter((c) => c.includes('data-match')).length, 3); // 総当たりは全試合が押せる
});
