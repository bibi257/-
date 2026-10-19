import { test, expect } from '@playwright/test';
import { open, importNames } from './helpers.js';

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test.describe(`初回の案内（幅${w}px）`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('参加者が0人の名簿には、1文と2つのボタンの案内が出る。押せる大きさで、横にはみ出さない', async ({ page }) => {
      await open(page);
      const box = page.locator('#roster-empty');
      await expect(box).toContainText('まず参加者を入力しましょう');
      await expect(box.locator('button')).toHaveText(['名前を入力して追加', '一括入力・CSV取込']);
      const sizes = await box.locator('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      for (const s of sizes) expect(s).toBeGreaterThanOrEqual(w <= 700 ? 44 : 30);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test('「名前を入力して追加」で追加欄にフォーカスが移り、「一括入力・CSV取込」で取込の画面が開く', async ({ page }) => {
      await open(page);
      await page.click('#roster-empty [data-act=focus-add]');
      await expect(page.locator('#new-player')).toBeFocused();
      await page.click('#roster-empty [data-act=import]');
      await expect(page.locator('#import-dialog')).toBeVisible();
      await page.click('#im-cancel');
    });

    test('1人でも追加すると、案内は消えて名簿の表になる', async ({ page }) => {
      await open(page);
      await page.fill('#new-player', '山田 太郎');
      await page.press('#new-player', 'Enter');
      await expect(page.locator('#roster-empty')).toHaveCount(0);
      await expect(page.locator('input.name')).toHaveCount(1);
    });

    test('表が無いタブの案内: 参加者が足りないときと、足りているときで、次にすることが変わる。ボタンで設定へ移る', async ({ page }) => {
      await open(page);
      for (const [tab, name] of [['tournament', 'トーナメント表'], ['league', '総当たり表'], ['standings', '順位表']]) {
        await page.click(`.tabs [data-tab=${tab}]`);
        const empty = page.locator(`#panel-${tab} .empty-state`);
        await expect(empty).toContainText('まず参加者を2人以上入力しましょう');
        await expect(empty.locator('button')).toHaveText('参加者を入力する');
        if (tab === 'tournament') {
          await empty.locator('button').click();
          await expect(page.locator('[data-tab=setup]')).toHaveAttribute('aria-selected', 'true');
        }
        expect(name).toBeTruthy();
      }
      await page.click('.tabs [data-tab=setup]');
      await importNames(page, ['A', 'B', 'C']);
      await page.click('.tabs [data-tab=tournament]');
      await expect(page.locator('#panel-tournament .empty-state')).toContainText('「参加者・設定」で「トーナメント表を作成」を押してください');
      await expect(page.locator('#panel-tournament .empty-state button')).toHaveText('表を作成する');
      await page.click('.tabs [data-tab=league]');
      await expect(page.locator('#panel-league .empty-state')).toContainText('「総当たり表を作成」を押してください');
      await page.click('.tabs [data-tab=standings]');
      await expect(page.locator('#panel-standings .empty-state')).toContainText('トーナメント表か総当たり表を作成しましょう');
      await page.click('#panel-standings .empty-state button');
      await expect(page.locator('[data-tab=setup]')).toHaveAttribute('aria-selected', 'true');
    });
  });
}
