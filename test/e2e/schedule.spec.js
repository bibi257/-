import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

const pad = (n) => String(n).padStart(2, '0');
function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test.describe('開催日時', () => {
  test('過去の日付は設定できず、元の値に戻って理由が出る。今日以降は設定できる', async ({ page }) => {
    await open(page);
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    // 時刻欄は日付が入るまで使えない
    await expect(page.locator('#meta-time')).toBeDisabled();
    await expect(page.locator('#meta-date')).toHaveAttribute('min', ymd(today));

    await page.fill('#meta-date', ymd(yesterday));
    await expect(page.locator('#schedule-error')).toContainText('過去の日付');
    await expect(page.locator('#meta-date')).toHaveValue('');

    await page.fill('#meta-date', '2099-12-31');
    await expect(page.locator('#schedule-error')).toHaveText('');
    await expect(page.locator('#meta-date')).toHaveValue('2099-12-31');
    await expect(page.locator('#meta-time')).toBeEnabled();
  });

  test('時刻を設定できる。再読み込みしても残る', async ({ page }) => {
    await open(page);
    await page.fill('#meta-date', '2099-12-31');
    await page.fill('#meta-time', '09:15');
    await expect(page.locator('#schedule-error')).toHaveText('');
    await page.reload();
    await expect(page.locator('#meta-date')).toHaveValue('2099-12-31');
    await expect(page.locator('#meta-time')).toHaveValue('09:15');
  });

  test('今日を選ぶと、今より前の時刻は設定できない', async ({ page }) => {
    await open(page);
    const now = new Date();
    test.skip(now.getHours() === 0 && now.getMinutes() === 0, '0時0分ちょうどは過去の時刻がない');
    await page.fill('#meta-date', ymd(now));
    await expect(page.locator('#schedule-error')).toHaveText('');
    await page.fill('#meta-time', '00:00');
    await expect(page.locator('#schedule-error')).toContainText('過去の時刻');
    await expect(page.locator('#meta-time')).toHaveValue('');
  });

  test('日時を消せる。保存データに日付と時刻が入る', async ({ page }) => {
    await open(page);
    await page.fill('#meta-date', '2099-12-31');
    await page.fill('#meta-time', '18:05');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bukatsu-taikai:state')));
    expect(saved.meta.date).toBe('2099-12-31');
    expect(saved.meta.time).toBe('18:05');
    await page.click('[data-act=clear-schedule]');
    await expect(page.locator('#meta-date')).toHaveValue('');
    await expect(page.locator('#meta-time')).toHaveValue('');
    await expect(page.locator('#meta-time')).toBeDisabled();
    const cleared = await page.evaluate(() => JSON.parse(localStorage.getItem('bukatsu-taikai:state')));
    expect(cleared.meta.date).toBe('');
    expect(cleared.meta.time).toBe('');
  });
});
