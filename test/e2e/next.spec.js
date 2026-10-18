import { test, expect } from '@playwright/test';
import { NAMES, acceptDialogs, open, importNames, setNumber, enterScore } from './helpers.js';

test.describe('保存して次へ', () => {
  test('トーナメント: 結果を保存すると次の試合の入力が開く。Ctrl+Enter でも進める', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, NAMES.slice(0, 4));
    await page.click('[data-act=gen-tournament]');

    await page.locator('.next-item', { hasText: 'No.1' }).click();
    await expect(page.locator('#rd-next')).toBeVisible();
    await page.fill('#rd-s1', '3');
    await page.fill('#rd-s2', '1');
    await page.click('#rd-next');
    await expect(page.locator('#toast')).toContainText('保存しました');
    // No.2 の入力が開き、スコア欄にフォーカスがある
    await expect(page.locator('#result-dialog')).toHaveJSProperty('open', true);
    await expect(page.locator('#rd-title')).toContainText('No.2');
    await expect(page.locator('#rd-s1')).toBeFocused();

    // Ctrl+Enter で保存して次へ。No.2 を終えると決勝（No.3）が次に開く
    await page.fill('#rd-s1', '0');
    await page.fill('#rd-s2', '2');
    await page.press('#rd-s2', 'Control+Enter');
    await expect(page.locator('#rd-title')).toContainText('No.3');

    // 通常の「保存」は従来どおり閉じる
    await enterScore(page, 1, 0);
    await expect(page.locator('#result-dialog')).toHaveJSProperty('open', false);
    await expect(page.locator('.champion')).toBeVisible();
  });

  test('結果が空のままでは次へ進めず、メッセージを出す。通常の「保存」は従来どおり閉じる', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, NAMES.slice(0, 4));
    await page.click('[data-act=gen-tournament]');
    await page.locator('.next-item', { hasText: 'No.1' }).click();
    await page.click('#rd-next');
    await expect(page.locator('#rd-error')).toContainText('次の試合へ進めます');
    await expect(page.locator('#rd-title')).toContainText('No.1');
    await page.fill('#rd-s1', '2');
    await page.fill('#rd-s2', '0');
    await page.click('#rd-ok');
    await expect(page.locator('#result-dialog')).toHaveJSProperty('open', false);
  });

  test('決勝を「保存して次へ」で終えると、次が無い旨を出す', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, NAMES.slice(0, 2));
    await page.click('[data-act=gen-tournament]');
    await page.locator('.next-item', { hasText: 'No.1' }).click();
    await page.fill('#rd-s1', '2');
    await page.fill('#rd-s2', '1');
    await page.click('#rd-next');
    await expect(page.locator('#toast')).toContainText('次に行う試合はありません');
    await expect(page.locator('#result-dialog')).toHaveJSProperty('open', false);
  });

  test('総当たり: 同じ回戦の次の試合へ進み、回戦が終わると次の回戦の最初の試合へ進む', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, NAMES.slice(0, 4));
    await setNumber(page, '#table-count', 2);
    await page.click('[data-act=gen-league]');
    await page.locator('.next-item', { hasText: 'No.1' }).click();
    await page.fill('#rd-s1', '1');
    await page.fill('#rd-s2', '0');
    await page.click('#rd-next');
    await expect(page.locator('#rd-title')).toContainText('No.2');
    await page.fill('#rd-s1', '0');
    await page.fill('#rd-s2', '1');
    await page.click('#rd-next');
    // 1回戦（2試合）が終わり、2回戦の最初の試合へ
    await expect(page.locator('#rd-title')).toContainText('No.3');
    await expect(page.locator('#rd-title')).toContainText('2回戦');
  });

  test('結果を持たない（対戦者未定）試合の入力では、ボタンを出さない', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, NAMES.slice(0, 4));
    await page.click('[data-act=gen-tournament]');
    await page.locator('table.results tbody tr[data-match="R2-M1"]').click();
    await expect(page.locator('#rd-next')).toBeHidden();
  });
});
