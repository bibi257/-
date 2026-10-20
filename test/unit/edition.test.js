import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentEdition, eventTitle, startNextEdition, deleteEdition, editionState, editionSummary, fitForShare, MAX_HISTORY,
} from '../../src/core/edition.js';
import { createState, parseState, serializeState } from '../../src/core/state.js';
import { generateTournament, resolveBracket, setTournamentResult } from '../../src/core/bracket.js';
import { generateLeague, setLeagueResult } from '../../src/core/league.js';
import { bracketTable, tournamentResultsTable } from '../../src/core/exportData.js';
import { setAbsent } from '../../src/core/attendance.js';

function base(n = 4) {
  const st = createState();
  st.meta.title = '春の大会';
  st.meta.date = '2026-04-01';
  st.players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `選手${i + 1}` }));
  st.settings = { ...st.settings, seedCount: 1, thirdPlace: true };
  return st;
}

/** トーナメントを最後まで進める（毎回 p1 側が勝つ） */
function finishTournament(st) {
  let t = generateTournament(st.players.map((p) => p.id), st.settings);
  for (let guard = 0; guard < 20; guard++) {
    const res = resolveBracket(t, st.tables);
    const m = res.playable.find((x) => x.status === 'ready');
    if (!m) break;
    t = setTournamentResult(t, m.id, { winnerId: m.p1, score1: 2, score2: 1 }).tournament;
  }
  return { ...st, tournament: t };
}

test('次の回: 表が無いうちは始められない', () => {
  const r = startNextEdition(base());
  assert.equal(r.ok, false);
  assert.match(r.error, /まだ表がありません/);
});

test('次の回: 参加者・卓・設定は引き継ぎ、表と結果は新しくなり、前の回が残る', () => {
  let st = finishTournament(base());
  st = { ...st, league: generateLeague(st.players.map((p) => p.id)) };
  st.tables[0].name = 'A卓';
  const r = startNextEdition(st);
  assert.equal(r.ok, true);
  const next = r.state;
  assert.deepEqual(next.players, st.players);
  assert.deepEqual(next.tables, st.tables);
  assert.deepEqual(next.settings, st.settings);
  assert.equal(next.meta.title, '春の大会');
  assert.equal(next.meta.date, ''); // 開催日は回ごとに入れ直す
  assert.equal(next.tournament, null);
  assert.equal(next.league, null);
  assert.equal(next.history.length, 1);
  assert.equal(next.history[0].edition, 1);
  assert.equal(next.history[0].date, '2026-04-01');
  assert.deepEqual(next.history[0].tournament, st.tournament);
  assert.deepEqual(next.history[0].league, st.league);
  assert.equal(currentEdition(next), 2);
  assert.equal(currentEdition(st), 1);
});

test('次の回: 元のデータは書き換えない。過去の回は、後から名簿を変えても変わらない', () => {
  const st = finishTournament(base());
  const before = JSON.stringify(st);
  const next = startNextEdition(st).state;
  assert.equal(JSON.stringify(st), before);
  const renamed = { ...next, players: next.players.map((p) => (p.id === 'p1' ? { ...p, name: '改名後' } : p)) };
  assert.equal(renamed.history[0].players.find((p) => p.id === 'p1').name, '選手1');
  next.history[0].players[0].name = 'x';
  assert.equal(st.players[0].name, '選手1'); // 写しなので元の名簿にも影響しない
});

test('次の回を重ねると、第1回・第2回・第3回の順に残る。上限を超えると断る', () => {
  let st = finishTournament(base());
  st = startNextEdition(st).state;
  st = finishTournament(st);
  st = startNextEdition(st).state;
  assert.deepEqual(st.history.map((e) => e.edition), [1, 2]);
  assert.equal(currentEdition(st), 3);
  let full = { ...st, history: Array.from({ length: MAX_HISTORY }, (_, i) => ({ ...st.history[0], edition: i + 1 })) };
  full = finishTournament(full);
  const r = startNextEdition(full);
  assert.equal(r.ok, false);
  assert.match(r.error, /20回分まで/);
});

test('回の削除: 現在の回の番号は、残っている最大の番号の次になる', () => {
  let st = finishTournament(base());
  st = startNextEdition(finishTournament(startNextEdition(st).state)).state; // 第1・2回が過去、今は第3回
  assert.equal(currentEdition(st), 3);
  const del = deleteEdition(st, 1);
  assert.deepEqual(del.history.map((e) => e.edition), [2]);
  assert.equal(currentEdition(del), 3); // 第2回が残っているので、第3回のまま（番号が重ならない）
  assert.equal(currentEdition(deleteEdition(st, 2)), 2); // 一番新しい過去の回を消すと、その番号に戻る
});

test('大会名: 過去の回があるときだけ「第N回」を付ける。過去の回を見ているときはその回の番号', () => {
  const st = finishTournament(base());
  assert.equal(eventTitle(st), '春の大会');
  const next = startNextEdition(st).state;
  assert.equal(eventTitle(next), '春の大会 第2回');
  assert.equal(eventTitle(editionState(next, 1)), '春の大会 第1回');
  assert.equal(eventTitle({ ...createState(), meta: { title: '', date: '' } }), '大会');
});

test('過去の回を表示用の大会データにする: 既存の出力がそのまま使え、ファイル名にも回が入る', () => {
  const st = finishTournament(base());
  const next = startNextEdition(st).state;
  const view = editionState(next, 1);
  assert.ok(view.tournament);
  assert.equal(view.meta.date, '2026-04-01');
  assert.equal(view.viewEdition, 1);
  assert.equal(editionState(next, 9), null);
  // 現在の回には表が無いが、過去の回の表は出力できる
  assert.match(bracketTable(view).title, /春の大会 第1回/);
  assert.match(tournamentResultsTable(view).title, /春の大会 第1回/);
  assert.ok(tournamentResultsTable(view).rows.length > 0);
});

test('欠席の印: 過去の回は、その回のときの出欠で付く（次の回で出欠がリセットされても、過去の回には残る）', () => {
  const st = finishTournament(base());
  const absentId = st.players[0].id;
  const marked = { ...st, players: setAbsent(st.players, absentId, true) };
  const next = startNextEdition(marked).state;
  assert.ok(next.players.every((p) => p.absent !== true)); // 次の回は全員出席に戻る
  assert.ok(!JSON.stringify(next.players).includes('absent'));
  const view = editionState(next, 1);
  assert.equal(view.players.find((p) => p.id === absentId).absent, true); // 過去の回には残る
  const name = view.players.find((p) => p.id === absentId).name;
  assert.ok(bracketTable(view).rows.flat().some((c) => c.includes(`${name}（欠席）`)));
  assert.ok(tournamentResultsTable(view).rows.flat().some((c) => c === `${name}（欠席）`));
});

test('過去の回の概要: 優勝者・総当たりの1位・途中の進み具合', () => {
  const done = finishTournament(base());
  const next = startNextEdition({ ...done, league: generateLeague(done.players.map((p) => p.id)) }).state;
  const s = editionSummary(next.history[0]);
  assert.match(s, /トーナメント 優勝 選手\d/);
  assert.match(s, /総当たり 途中（0\/6試合）/);

  let league = generateLeague(done.players.map((p) => p.id));
  for (const m of league.matches) league = setLeagueResult(league, m.id, { outcome: 'p1', score1: 1, score2: 0 }).league ?? league;
  const entry = startNextEdition({ ...base(), league }).state.history[0];
  assert.match(editionSummary(entry), /総当たり 1位 選手\d/);

  const half = generateTournament(['p1', 'p2', 'p3', 'p4'], {});
  assert.match(editionSummary({ ...entry, tournament: half, league: null }), /トーナメント 途中（0\/3試合）/);
  assert.equal(editionSummary({ ...entry, tournament: null, league: null }), '表なし');
});

test('保存と読込: 過去の回も往復できる。古い形式（history なし）は空の履歴として読める', () => {
  let st = finishTournament(base());
  st = startNextEdition(st).state;
  const r = parseState(serializeState(st));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.state.history.length, 1);
  assert.deepEqual(r.state.history[0].tournament, st.history[0].tournament);
  assert.equal(eventTitle(r.state), '春の大会 第2回');

  const legacy = JSON.parse(serializeState(createState()));
  delete legacy.history;
  const l = parseState(legacy);
  assert.equal(l.ok, true);
  assert.deepEqual(l.state.history, []);
});

test('読込: 過去の回の中身も検査する（不正な表・重複した回・多すぎる回・名簿の不正）', () => {
  const st = startNextEdition(finishTournament(base())).state;
  const raw = () => JSON.parse(serializeState(st));
  const bad = (mutate) => {
    const d = raw();
    mutate(d);
    return parseState(d);
  };
  assert.equal(bad((d) => { d.history[0].tournament.slots = [1, 2]; }).ok, false);
  assert.equal(bad((d) => { d.history[0].players[0].id = '<img onerror=x>'; }).ok, false);
  assert.equal(bad((d) => { d.history[0].tables = []; }).ok, false);
  assert.equal(bad((d) => { d.history = {}; }).ok, false);
  assert.equal(bad((d) => { d.history.push({ ...d.history[0] }); }).ok, false); // 同じ回が2つ
  assert.equal(bad((d) => { d.history = Array.from({ length: MAX_HISTORY + 1 }, (_, i) => ({ ...d.history[0], edition: i + 1 })); }).ok, false);
  assert.equal(bad((d) => { d.history[0].edition = 0; }).ok, false);
  // 知らない項目は捨てる
  const extra = bad((d) => { d.history[0].secret = 'x'; d.history[0].tournament.hack = 1; });
  assert.equal(extra.ok, true);
  assert.equal('secret' in extra.state.history[0], false);
});

test('共有への送信: 大きすぎるときは古い回から外す。この端末のデータは変えない', () => {
  let st = finishTournament(base());
  for (let i = 0; i < 3; i++) st = finishTournament(startNextEdition(st).state);
  assert.equal(st.history.length, 3);
  assert.equal(fitForShare(st), st); // 収まるなら、そのまま
  const size = JSON.stringify(st).length;
  const fit = fitForShare(st, size - 10);
  assert.deepEqual(fit.history.map((e) => e.edition), [2, 3]); // 最古の第1回を外す
  assert.equal(currentEdition(fit), 4); // 現在の回の番号は変わらない
  assert.equal(st.history.length, 3);
  assert.equal(fitForShare(st, 10).history.length, 0);
});

test('1回分の大きさの目安: 小さな大会なら、上限（20回）まで共有サーバーの上限に収まる', () => {
  let st = base(16);
  st = { ...finishTournament(st), league: generateLeague(st.players.map((p) => p.id)) };
  const one = JSON.stringify(startNextEdition(st).state.history[0]).length;
  assert.ok(one * MAX_HISTORY < 900000, `1回分 ${one} 文字`);
});
