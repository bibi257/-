import { test, expect } from '@playwright/test';
import { NAMES, acceptDialogs, open, importNames, enterScore } from './helpers.js';

/** 総当たりを最後まで入力する（名簿で前にいる選手が勝つ） */
async function playLeague(page, n) {
  const total = (n * (n - 1)) / 2;
  for (let i = 0; i < total; i++) {
    await page.locator('.next-item').first().click();
    const [a, b] = [await page.locator('#rd-p1').textContent(), await page.locator('#rd-p2').textContent()];
    const win1 = NAMES.indexOf(a) < NAMES.indexOf(b);
    await enterScore(page, win1 ? 1 : 0, win1 ? 0 : 1);
    await expect(page.locator('#result-dialog')).not.toBeVisible();
  }
}

test('総当たりの上位N人を順位順の名簿にして、次の回を始められる', async ({ page }) => {
  const dialogs = acceptDialogs(page);
  await open(page);
  await importNames(page, NAMES.slice(0, 5).reverse()); // 名簿は逆順
  await page.fill('#meta-title', '予選');
  await page.click('[data-act=gen-league]');
  await playLeague(page, 5);

  await page.click('.tabs [data-tab=standings]');
  const q = page.locator('.qualify');
  await expect(q).toBeVisible();
  await expect(page.locator('#qualify-count')).toHaveValue('4');
  await page.fill('#qualify-count', '3');
  await page.click('[data-edition=qualify]');

  const msg = dialogs.at(-1);
  expect(msg).toContain('上位3人');
  expect(msg).toContain('山田 太郎、佐藤 花子、鈴木 一郎'); // 順位順
  expect(msg).not.toContain('同順位');

  // 参加者・設定タブに移り、順位順の3人になっている。前の回は残る
  await expect(page.locator('#editions-card')).toContainText('今は第2回');
  await expect(page.locator('#panel-setup')).toContainText('3人');
  const names = await page.locator('#panel-setup input.name').evaluateAll((els) => els.map((e) => e.value));
  expect(names).toEqual(['山田 太郎', '佐藤 花子', '鈴木 一郎']);
  await expect(page.locator('#editions-card')).toContainText('第1回');
  await expect(page.locator('#editions-card')).toContainText('総当たり 1位 山田 太郎');

  // そのまま決勝トーナメントを作れる（シード順＝順位順）
  await page.click('[data-act=gen-tournament]');
  await page.waitForSelector('#bracket-wrap svg');
  await expect(page.locator('.next-item')).toHaveCount(1);

  // 過去の回（第1回）の名簿は5人のまま
  await page.click('.tabs [data-tab=setup]');
  await page.click('[data-edition-view="1"]');
  await page.click('.tabs [data-tab=standings]');
  await expect(page.locator('#panel-standings table.data').last().locator('tbody tr')).toHaveCount(5);
  await expect(page.locator('.qualify')).toBeHidden(); // 過去の回（読み取り専用）では出ない
});

test('人数が範囲外のときは始まらない。境目に同順位がいるときは確認で知らせる', async ({ page }) => {
  const dialogs = acceptDialogs(page);
  await open(page);
  await importNames(page, NAMES.slice(0, 4));
  await page.click('[data-act=gen-league]');
  // 全試合を引き分けにする → 全員同順位
  for (let i = 0; i < 6; i++) {
    await page.locator('.next-item').first().click();
    await enterScore(page, 1, 1);
    await expect(page.locator('#result-dialog')).not.toBeVisible();
  }
  await page.click('.tabs [data-tab=standings]');
  await page.fill('#qualify-count', '1');
  await page.click('[data-edition=qualify]');
  await expect(page.locator('#toast')).toContainText('2〜4');
  expect(dialogs.some((m) => m.includes('第2回を始めます'))).toBe(false);

  await page.fill('#qualify-count', '2');
  await page.click('[data-edition=qualify]');
  expect(dialogs.at(-1)).toContain('同順位の選手がいます');
});

test('トーナメントだけの大会には出さない', async ({ page }) => {
  acceptDialogs(page);
  await open(page);
  await importNames(page, NAMES.slice(0, 4));
  await page.click('[data-act=gen-tournament]');
  await page.click('.tabs [data-tab=standings]');
  await expect(page.locator('.qualify')).toHaveCount(0);
});
