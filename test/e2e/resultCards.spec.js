import { test, expect } from '@playwright/test';
import { open, importNames } from './helpers.js';

const NAMES12 = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎', '田中 三郎', '伊藤 四郎', '渡辺 五郎', '中村 六子', '小林 七海', '加藤 八郎', '吉田 九太', 'ああああああああああ'];
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const css = (loc, prop) => loc.evaluate((el, p) => getComputedStyle(el)[p], prop);

test.describe('試合結果一覧（スマホ幅 390px はカード）', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('トーナメント（12人）: カードで表示し、表は隠れる。横スクロールが出ない', async ({ page }) => {
    await open(page);
    await importNames(page, NAMES12);
    await page.click('[data-act=gen-tournament]');
    await expect(page.locator('.results-table')).toBeHidden();
    const cards = page.locator('.results-table ~ .result-cards li');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBe(await page.locator('table.results tbody tr').count());
    expect(await noOverflow(page)).toBe(true);
    // 不戦は1行
    const bye = page.locator('.results-table ~ .result-cards .rc.st-bye').first();
    await expect(bye).toContainText('不戦で勝ち上がり');
    expect((await bye.boundingBox()).height).toBeLessThan(60);
    // 不戦は押せない。対戦者未定は、表の行と同じく押せる（卓の変更用）
    await expect(bye).not.toHaveAttribute('data-match', /.+/);
    await expect(page.locator('.results-table ~ .result-cards .rc.st-waiting').first()).toHaveAttribute('data-match', /.+/);
  });

  test('カードをタップすると結果入力が開き、保存するとカードが「終了」になり勝者が太字', async ({ page }) => {
    await open(page);
    await importNames(page, NAMES12);
    await page.click('[data-act=gen-tournament]');
    const ready = page.locator('.results-table ~ .result-cards .rc.st-ready').first();
    await expect(ready.locator('.badge-ready')).toHaveText('試合待ち');
    await ready.tap();
    await expect(page.locator('#result-dialog')).toHaveJSProperty('open', true);
    await page.fill('#rd-s1', '3');
    await page.fill('#rd-s2', '1');
    await page.tap('#rd-ok');
    const done = page.locator('.results-table ~ .result-cards .rc.st-done').first();
    await expect(done.locator('.badge-done')).toHaveText('終了');
    await expect(done.locator('.rc-score')).toHaveText('3 － 1');
    // 勝者の名前だけが太字
    expect(Number(await css(done.locator('.rc-win'), 'fontWeight'))).toBeGreaterThanOrEqual(700);
    expect(Number(await css(done.locator('.rc-p:not(.rc-win)'), 'fontWeight'))).toBeLessThan(600);
    expect(await noOverflow(page)).toBe(true);
  });

  test('総当たり（12人・66試合）: カードで表示し、横スクロールが出ない。タップで結果入力', async ({ page }) => {
    await open(page);
    await importNames(page, NAMES12);
    await page.click('[data-act=gen-league]');
    await expect(page.locator('.results-table')).toBeHidden();
    await expect(page.locator('.results-table ~ .result-cards li')).toHaveCount(66);
    expect(await noOverflow(page)).toBe(true);
    await page.locator('.results-table ~ .result-cards .rc').first().tap();
    await expect(page.locator('#result-dialog')).toHaveJSProperty('open', true);
    await page.fill('#rd-s1', '2');
    await page.fill('#rd-s2', '2');
    await page.tap('#rd-ok');
    await expect(page.locator('.results-table ~ .result-cards .rc.st-done .rc-score').first()).toHaveText('2 － 2');
    await expect(page.locator('.results-table ~ .result-cards .rc.st-done .rc-win')).toHaveCount(0); // 引き分けは誰も太字にならない
  });
});

test.describe('試合結果一覧（PC幅 1280px は表のまま）', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('表を表示し、カードは隠れる', async ({ page }) => {
    await open(page);
    await importNames(page, NAMES12);
    await page.click('[data-act=gen-tournament]');
    await expect(page.locator('.results-table')).toBeVisible();
    await expect(page.locator('.results-table ~ .result-cards')).toBeHidden();
  });

  test('印刷では、カードは出ず、表が出る', async ({ page }) => {
    await open(page);
    await importNames(page, NAMES12);
    await page.click('[data-act=gen-tournament]');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.results-table ~ .result-cards')).toBeHidden();
    await expect(page.locator('table.results')).toBeVisible();
  });
});
