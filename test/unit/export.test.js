import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, playerLabel, ABSENT_MARK } from '../../src/core/state.js';
import { makePlayers } from '../../src/core/players.js';
import { setAbsent } from '../../src/core/attendance.js';
import { generateTournament, setTournamentResult } from '../../src/core/bracket.js';
import { generateLeague, setLeagueResult } from '../../src/core/league.js';
import {
  bracketTable, tournamentResultsTable, tournamentStandingsTable,
  leagueMatrixTable, leagueResultsTable, leagueStandingsTable,
} from '../../src/core/exportData.js';
import { bracketSvg, tableSvg } from '../../src/render/svg.js';
import { toCSV, parseCSV } from '../../src/core/csv.js';

function sample(n = 4, opts = {}) {
  const st = createState();
  st.meta.title = '春季大会';
  st.players = makePlayers(Array.from({ length: n }, (_, i) => `選手${i + 1}`));
  st.tournament = generateTournament(st.players.map((p) => p.id), opts);
  if (n <= 40) st.league = generateLeague(st.players.map((p) => p.id));
  return st;
}

test('トーナメント表CSV: 回戦ごとの列と優勝者', () => {
  const st = sample(4);
  let t = st.tournament;
  t = setTournamentResult(t, 'R1-M1', { score1: 3, score2: 0 }).tournament;
  t = setTournamentResult(t, 'R1-M2', { score1: 1, score2: 2 }).tournament;
  t = setTournamentResult(t, 'R2-M1', { score1: 2, score2: 1 }).tournament;
  st.tournament = t;
  const tb = bracketTable(st);
  assert.equal(tb.title, '春季大会 トーナメント表');
  assert.deepEqual(tb.headers, ['準決勝', '決勝', '優勝']);
  assert.equal(tb.rows.length, 4);
  assert.equal(tb.rows[0][0], '○選手1 (3)');
  assert.equal(tb.rows[1][0], '選手4 (0)');
  assert.equal(tb.rows[0][1], '○選手1 (2)');
  assert.equal(tb.rows[2][1], '選手3 (1)');
  assert.equal(tb.rows[0][2], '選手1');
});

test('トーナメント表CSV: 不戦と3位決定戦', () => {
  const st = sample(3, { thirdPlace: true });
  const tb = bracketTable(st);
  assert.equal(tb.rows[1][0], '（不戦）');
  assert.equal(tb.rows.at(-1)[0], '3位決定戦');
});

test('試合結果・順位表CSV', () => {
  const st = sample(4);
  st.tournament = setTournamentResult(st.tournament, 'R1-M1', { walkover: true, outcome: 'p2' }).tournament;
  const rt = tournamentResultsTable(st);
  assert.equal(rt.headers[0], '試合番号');
  const row = rt.rows.find((r) => r[0] === 1);
  assert.equal(row[5], '不戦勝');
  assert.equal(row[7], '選手4');
  assert.equal(row[8], '終了');
  const s = tournamentStandingsTable(st);
  // 4人なら1回戦が準決勝。3位決定戦なしのため敗者は3位
  assert.equal(s.rows.find((r) => r[1] === '選手1')[2], '3位');
  assert.equal(s.rows.find((r) => r[1] === '選手1')[0], 3);
});

test('総当たり表: ○×△と不戦勝、未入力は空欄、自分自身は－', () => {
  const st = sample(3);
  const [m1, m2] = st.league.matches;
  st.league = setLeagueResult(st.league, m1.id, { score1: 3, score2: 1 }).league;
  st.league = setLeagueResult(st.league, m2.id, { walkover: true, outcome: 'p2' }).league;
  const mt = leagueMatrixTable(st);
  assert.deepEqual(mt.headers, ['', '選手1', '選手2', '選手3', '勝', '分', '敗', '勝点', '順位']);
  const idx = (id) => st.league.playerIds.indexOf(id);
  const cell = (a, b) => mt.rows[idx(a)][idx(b) + 1];
  assert.equal(cell(m1.p1, m1.p2), '○ 3-1');
  assert.equal(cell(m1.p2, m1.p1), '× 1-3');
  assert.equal(cell(m2.p2, m2.p1), '○ 不戦勝');
  assert.equal(cell(m2.p1, m2.p2), '× 不戦敗');
  const m3 = st.league.matches[2]; // 結果を入れていない試合
  assert.equal(cell(m3.p1, m3.p2), '');
  assert.equal(cell(m3.p2, m3.p1), '');
  assert.equal(mt.rows[0][1], '－');
  const rt = leagueResultsTable(st);
  assert.equal(rt.rows[0][7].endsWith('の勝ち'), true);
  const s = leagueStandingsTable(st);
  assert.equal(s.headers.at(-1), '勝点');
  assert.match(s.note, /勝点 勝3/);
});

test('CSV 往復で日本語が保たれる', () => {
  const st = sample(5);
  const rows = [leagueMatrixTable(st).headers, ...leagueMatrixTable(st).rows];
  const back = parseCSV(toCSV(rows));
  assert.deepEqual(back, rows.map((r) => r.map((c) => String(c))));
});

test('SVG: 名前をエスケープし、寸法を返す', () => {
  const st = sample(8, { thirdPlace: true });
  st.players[0].name = '<A&B>"';
  const { svg, width, height } = bracketSvg(st, { interactive: true });
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('&lt;A&amp;B&gt;&quot;'));
  assert.ok(!svg.includes('<A&B>'));
  assert.ok(width > 400 && height > 8 * 36);
  // 対話用の試合要素は実際に行う試合の数（7）＋3位決定戦
  assert.equal((svg.match(/class="match /g) || []).length, 8);
  const plain = bracketSvg(st).svg;
  assert.equal((plain.match(/class="match /g) || []).length, 0);
});

test('SVG: 128人でも生成できる', () => {
  const st = sample(128);
  const { width, height } = bracketSvg(st);
  assert.ok(height > 128 * 36);
  assert.ok(width < 3000);
});

test('表SVG: 行数に応じた高さ', () => {
  const st = sample(6);
  const table = leagueStandingsTable(st);
  const { svg, height } = tableSvg(st, table);
  assert.ok(svg.includes('総当たり 順位表'));
  assert.ok(height >= 56 + 7 * 28);
});

test('トーナメント表CSV: 3位決定戦の行も見出しと同じ列数（3〜8人）', () => {
  for (const n of [3, 4, 5, 8]) {
    const st = sample(n, { thirdPlace: true });
    const tb = bracketTable(st);
    for (const row of tb.rows) assert.equal(row.length, tb.headers.length, `${n}人`);
  }
  // 4人: スコアは対戦者の欄にまとめる
  const st = sample(4, { thirdPlace: true });
  let t = st.tournament;
  t = setTournamentResult(t, 'R1-M1', { score1: 3, score2: 0 }).tournament;
  t = setTournamentResult(t, 'R1-M2', { score1: 2, score2: 1 }).tournament;
  t = setTournamentResult(t, '3P', { score1: 1, score2: 4 }).tournament;
  st.tournament = t;
  assert.deepEqual(bracketTable(st).rows.at(-1), ['3位決定戦', '選手4 vs 選手3 (1-4)', '3位: 選手3']);
});

test('トーナメント順位表: 勝ち残りが上・敗退が順位の高い順。CSV の列は変えない', () => {
  const st = sample(8);
  st.tournament = setTournamentResult(st.tournament, 'R1-M1', { score1: 3, score2: 0 }).tournament;
  const s = tournamentStandingsTable(st);
  assert.deepEqual(s.headers, ['順位', '名前', '成績', '勝', '敗']);
  assert.equal(s.rows.length, 8);
  assert.deepEqual(s.rows.slice(0, 7).map((r) => r[2]), Array(7).fill('勝ち残り'));
  assert.deepEqual(s.rows[0].slice(0, 1), ['']); // 勝ち残りの順位は空欄（画面はバッジ）
  assert.equal(s.rows[7][0], 5);
  assert.equal(s.rows[7][2], '準々決勝敗退');
  assert.deepEqual(s.rowMedals, Array(8).fill(null));
});

test('トーナメント順位表: 大会が終わると 1〜3位の印（rowMedals）が付き、PNG に帯が出る', () => {
  const st = sample(4);
  let t = st.tournament;
  t = setTournamentResult(t, 'R1-M1', { score1: 3, score2: 0 }).tournament;
  t = setTournamentResult(t, 'R1-M2', { score1: 1, score2: 2 }).tournament;
  t = setTournamentResult(t, 'R2-M1', { score1: 2, score2: 1 }).tournament;
  st.tournament = t;
  const s = tournamentStandingsTable(st);
  assert.deepEqual(s.rowMedals, ['gold', 'silver', 'bronze', 'bronze']);
  const { svg } = tableSvg(st, s);
  assert.equal((svg.match(/width="4" height="28"/g) || []).length, 4);
  assert.ok(svg.includes('fill="#e0a800"') && svg.includes('fill="#9aa5b1"') && svg.includes('fill="#b87333"'));
  // 途中は帯なし
  const mid = sample(4);
  assert.ok(!tableSvg(mid, tournamentStandingsTable(mid)).svg.includes('width="4" height="28"'));
});

test('SVG（PNG出力）: 優勝が決まったら右上に優勝者名を小さく入れる。決まるまでは入れない', () => {
  const st = sample(4);
  assert.ok(!bracketSvg(st).svg.includes('優勝　'));
  let t = st.tournament;
  for (const id of ['R1-M1', 'R1-M2', 'R2-M1']) t = setTournamentResult(t, id, { score1: 2, score2: 1 }).tournament;
  st.tournament = t;
  const { svg, width } = bracketSvg(st);
  assert.ok(svg.includes('優勝　選手1'));
  // 右上（右端から16px、タイトルと同じ高さ）に、右寄せで置く
  assert.ok(svg.includes(`x="${width - 16}" y="24"`));
  assert.ok(svg.includes('text-anchor="end"'));
  // 長い大会名でタイトルと重なるときは、1行下げる
  st.meta.title = 'あ'.repeat(40);
  assert.ok(bracketSvg(st).svg.includes(`y="44"`));
});

// ---- 欠席の印（N11）----

function withAbsent(n = 4) {
  const st = sample(n);
  st.players = setAbsent(st.players, st.players[1].id, true); // 選手2が欠席
  return st;
}

test('欠席の印: 欠席の選手の名前の後ろに「（欠席）」。出席の選手・欠席のいない大会は変わらない', () => {
  const st = withAbsent();
  assert.equal(ABSENT_MARK, '（欠席）');
  assert.equal(playerLabel(st, st.players[1].id), '選手2（欠席）');
  assert.equal(playerLabel(st, st.players[0].id), '選手1');
  assert.equal(playerLabel(st, null), '（不戦）');
  assert.equal(playerLabel(st, undefined), '');
  const plain = sample();
  assert.ok(!JSON.stringify(bracketTable(plain)).includes('欠席'));
});

test('欠席の印: トーナメント表・試合結果・順位表（CSV・PNG の元の表データ）に付く', () => {
  const st = withAbsent();
  assert.ok(bracketTable(st).rows.flat().some((c) => c.includes('選手2（欠席）')));
  assert.ok(!bracketTable(st).rows.flat().some((c) => c.includes('選手1（欠席）')));
  assert.ok(tournamentResultsTable(st).rows.flat().some((c) => c === '選手2（欠席）'));
  assert.ok(tournamentStandingsTable(st).rows.some((r) => r[1] === '選手2（欠席）'));
  // CSV にもそのまま出る
  const t = bracketTable(st);
  assert.match(toCSV([t.headers, ...t.rows]), /選手2（欠席）/);
});

test('欠席の印: 総当たり表（対戦表の見出しと行）・試合結果・順位表に付く', () => {
  const st = withAbsent();
  const m = leagueMatrixTable(st);
  assert.ok(m.headers.includes('選手2（欠席）'));
  assert.ok(m.rows.some((r) => r[0] === '選手2（欠席）'));
  assert.ok(leagueResultsTable(st).rows.some((r) => r[4] === '選手2（欠席）' || r[6] === '選手2（欠席）'));
  assert.ok(leagueStandingsTable(st).rows.some((r) => r[1] === '選手2（欠席）'));
});

test('欠席の印: トーナメント表の SVG（画面・PNG）と表の SVG の文字にも付く', () => {
  const st = withAbsent();
  assert.match(bracketSvg(st).svg, /選手2（欠席）/);
  assert.doesNotMatch(bracketSvg(sample()).svg, /欠席/);
  assert.match(tableSvg(st, leagueStandingsTable(st)).svg, /選手2（欠席）/);
  assert.match(tableSvg(st, tournamentStandingsTable(st)).svg, /選手2（欠席）/);
});
