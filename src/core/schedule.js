// 開催日・開始時刻の検査と表示。日付は 'YYYY-MM-DD'、時刻は 'HH:mm'（24時間）。どちらも空は「未設定」

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const p2 = (n) => String(n).padStart(2, '0');

export function isValidDate(s) {
  const m = DATE_RE.exec(String(s));
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

export function isValidTime(s) {
  return TIME_RE.test(String(s));
}

/** 端末のローカル時刻での今日（入力欄の min に使う） */
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
}

/** 端末のローカル時刻での今の時刻（分まで） */
export function localNowTime(now = new Date()) {
  return `${p2(now.getHours())}:${p2(now.getMinutes())}`;
}

/**
 * 日程を設定してよいか。過去の日付・過去の時刻は設定できない（今日なら、今の時刻以降）。
 * @returns {string|null} 設定できない理由。問題なければ null
 */
export function validateSchedule(date, time, now = new Date()) {
  if (date === '' && time === '') return null;
  if (date === '') return '時刻だけは設定できません。先に日付を入力してください';
  if (!isValidDate(date)) return '日付の形式が正しくありません';
  if (time !== '' && !isValidTime(time)) return '時刻の形式が正しくありません（例 13:30）';
  const today = localToday(now);
  if (date < today) return '過去の日付は設定できません';
  if (date === today && time !== '' && time < localNowTime(now)) return '過去の時刻は設定できません（今日なら、今より後の時刻にしてください）';
  return null;
}

/** 画面・出力に出す表記。例 2026/10/20 13:00。日付が無ければ空 */
export function formatEventDate(date, time) {
  if (!isValidDate(date)) return '';
  const d = date.replaceAll('-', '/');
  return isValidTime(time) ? `${d} ${time}` : d;
}
