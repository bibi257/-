import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSchedule, formatEventDate, localToday, localNowTime } from '../../src/core/schedule.js';
import { createState, parseState, serializeState } from '../../src/core/state.js';

// 2026-10-18 14:30（ローカル時刻）
const NOW = new Date(2026, 9, 18, 14, 30, 15);

test('今日・今の時刻の文字列（入力欄の min に使う）', () => {
  assert.equal(localToday(NOW), '2026-10-18');
  assert.equal(localNowTime(NOW), '14:30');
  assert.equal(localToday(new Date(2026, 0, 5, 0, 0)), '2026-01-05');
});

test('日程の検査: 空は可。過去の日付は不可。今日以降は可', () => {
  assert.equal(validateSchedule('', '', NOW), null);
  assert.equal(validateSchedule('2026-10-18', '', NOW), null);
  assert.equal(validateSchedule('2026-12-01', '', NOW), null);
  assert.match(validateSchedule('2026-10-17', '', NOW), /過去の日付/);
  assert.match(validateSchedule('2025-01-01', '10:00', NOW), /過去の日付/);
});

test('日程の検査: 今日の時刻は今より前を不可にする（同じ分は可）。未来の日なら時刻は自由', () => {
  assert.match(validateSchedule('2026-10-18', '14:29', NOW), /過去の時刻/);
  assert.equal(validateSchedule('2026-10-18', '14:30', NOW), null);
  assert.equal(validateSchedule('2026-10-18', '18:00', NOW), null);
  assert.equal(validateSchedule('2026-10-19', '00:00', NOW), null);
});

test('日程の検査: 日付なしの時刻・形式の誤りは不可', () => {
  assert.match(validateSchedule('', '10:00', NOW), /日付/);
  assert.match(validateSchedule('2026/10/20', '', NOW), /日付/);
  assert.match(validateSchedule('2026-13-40', '', NOW), /日付/);
  assert.match(validateSchedule('2026-10-20', '25:00', NOW), /時刻/);
  assert.match(validateSchedule('2026-10-20', '9:00', NOW), /時刻/);
});

test('表示用の整形: 日付と時刻を日本の表記に。どちらかが無ければ有るほうだけ', () => {
  assert.equal(formatEventDate('2026-10-20', '13:00'), '2026/10/20 13:00');
  assert.equal(formatEventDate('2026-10-20', ''), '2026/10/20');
  assert.equal(formatEventDate('', '13:00'), '');
  assert.equal(formatEventDate('', ''), '');
  assert.equal(formatEventDate('不正', '13:00'), '');
});

test('保存・読込: 開催日と時刻が往復する。形式が不正なら空にする。古いファイル（時刻なし）も読める', () => {
  const st = createState();
  st.meta.date = '2026-10-20';
  st.meta.time = '13:00';
  const r = parseState(serializeState(st));
  assert.equal(r.state.meta.date, '2026-10-20');
  assert.equal(r.state.meta.time, '13:00');
  const raw = JSON.parse(serializeState(st));
  raw.meta = { title: 'A', date: '<script>', time: '99:99' };
  const m = parseState(raw).state.meta;
  assert.equal(m.date, '');
  assert.equal(m.time, '');
  raw.meta = { title: 'A', date: '2026-10-20' };
  assert.equal(parseState(raw).state.meta.time, '');
  assert.equal(createState().meta.time, '');
});
