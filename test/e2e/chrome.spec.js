import { test, expect } from '@playwright/test';
import { open, importNames } from './helpers.js';

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test.describe(`タブとポップ（幅${w}px）`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('タブの帯は縦に動かない', async ({ page }) => {
      await open(page);
      const tabs = page.locator('.tabs');
      expect(await tabs.evaluate((el) => getComputedStyle(el).overflowY)).toBe('hidden');
      // 帯の上でホイールを回しても、帯の中身は縦にずれない
      const b = await tabs.boundingBox();
      await page.mouse.move(b.x + 20, b.y + b.height / 2);
      await page.mouse.wheel(0, 40);
      await page.waitForTimeout(200);
      expect(await tabs.evaluate((el) => el.scrollTop)).toBe(0);
    });

    test('操作後のポップは文字が中央揃えで、画面の半分の幅で折り返さない', async ({ page }) => {
      await open(page);
      await importNames(page, ['A', 'B', 'C', 'D']);
      await page.click('[data-act=gen-tournament]');
      const toast = page.locator('#toast');
      await expect(toast).toContainText('作成しました');
      expect(await toast.evaluate((el) => getComputedStyle(el).textAlign)).toBe('center');
      const b = await toast.boundingBox();
      expect(b.height).toBeLessThan(50); // 1行に収まる
      expect(Math.abs(b.x + b.width / 2 - w / 2)).toBeLessThan(1); // 画面の中央
    });
  });
}
