import { test, expect } from '@playwright/test';
import { NAMES, acceptDialogs, open, importNames, setNumber, genTournament } from './helpers.js';

test.describe('シード（指名・ランダム）', () => {
  test('指名: 名前にチェックを付けた選手がシードになり、不戦はシードが受ける。順位は名簿の上から', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, NAMES.slice(0, 6));
    // 既定はシードなし: チェック欄は出ない
    await expect(page.locator('.seed-pick-box')).toHaveCount(0);
    await page.selectOption('#seed-mode', 'pick');
    await expect(page.locator('.seed-pick-box')).toHaveCount(6);
    // 3人目と6人目を指名 → 名簿の上から 第1・第2シード
    await page.locator('.seed-pick-box').nth(5).check();
    await page.locator('.seed-pick-box').nth(2).check();
    await expect(page.locator('.seed-badge')).toHaveCount(2);
    await expect(page.locator('tr[data-id]').nth(2).locator('.seed-badge')).toHaveText('第1シード');
    await expect(page.locator('tr[data-id]').nth(5).locator('.seed-badge')).toHaveText('第2シード');
    await expect(page.locator('#panel-setup')).toContainText('指名 2人');
    await expect(page.locator('#panel-setup')).toContainText('1回戦不戦（シード上位から） 2枠');

    await genTournament(page);
    // 6人・8枠: 不戦は2つ。シード上位（指名した2人）から不戦が割り当てられる
    const byes = page.locator('table.results tbody tr', { hasText: '不戦' });
    await expect(byes).toHaveCount(2);
    await expect(byes.nth(0)).toContainText(NAMES[2]);
    await expect(byes.nth(1)).toContainText(NAMES[5]);
  });

  test('指名: チェックを外す・名簿から削除しても、人数と表示が合う。保存して読み込んでも残る', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, NAMES.slice(0, 4));
    await page.selectOption('#seed-mode', 'pick');
    await page.locator('.seed-pick-box').nth(0).check();
    await page.locator('.seed-pick-box').nth(1).check();
    await page.locator('.seed-pick-box').nth(1).uncheck();
    await expect(page.locator('#panel-setup')).toContainText('指名 1人');
    await page.locator('.seed-pick-box').nth(3).check();
    // 1人目を削除すると、指名は残りの人だけ数える
    await page.locator('button[data-act=del][data-i="0"]').click();
    await expect(page.locator('#panel-setup')).toContainText('指名 1人');
    await page.reload();
    await expect(page.locator('#seed-mode')).toHaveValue('pick');
    await expect(page.locator('.seed-pick-box:checked')).toHaveCount(1);
  });

  test('ランダム: 人数を指定すると、その人数がシード扱いで作成される。チェック欄は出ない', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, NAMES.slice(0, 7));
    await page.selectOption('#seed-mode', 'random');
    await expect(page.locator('.seed-pick-box')).toHaveCount(0);
    await setNumber(page, '#seed-count', 2);
    await expect(page.locator('#panel-setup')).toContainText('1回戦不戦（シード上位から） 1枠');
    await genTournament(page);
    await expect(page.locator('#bracket-wrap g.match')).toHaveCount(6);
    // 不戦の1試合（シードが受ける）は、結果入力できない試合として一覧に出る
    await expect(page.locator('table.results tbody tr', { hasText: '不戦' })).toHaveCount(1);
  });

  test('シードなしに戻せる。ランダムの人数は参加者数を超えない', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, NAMES.slice(0, 4));
    await page.selectOption('#seed-mode', 'random');
    await setNumber(page, '#seed-count', 99);
    await expect(page.locator('#seed-count')).toHaveValue('4');
    await page.selectOption('#seed-mode', 'none');
    await expect(page.locator('#seed-count')).toHaveCount(0);
    await expect(page.locator('.seed-pick-box')).toHaveCount(0);
  });
});
