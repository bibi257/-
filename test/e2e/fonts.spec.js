import { test, expect } from '@playwright/test';
import { open, importNames, genTournament, NAMES } from './helpers.js';

test.describe('フォント（IBM Plex Sans JP・IBM Plex Mono）', () => {
  test('本文は IBM Plex Sans JP で、フォントのファイルが読み込まれる', async ({ page }) => {
    await open(page);
    await importNames(page, NAMES);
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^"?IBM Plex Sans JP"?,/);
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family}|${f.weight}`));
    expect(loaded).toContain('IBM Plex Sans JP|400');
    expect(loaded).toContain('IBM Plex Sans JP|700');
    // 画面に出ている日本語の字が、実際に IBM Plex Sans JP で描かれている
    expect(await page.evaluate(async () => { await document.fonts.load('15px "IBM Plex Sans JP"', '山田太郎'); return document.fonts.check('15px "IBM Plex Sans JP"', '山田太郎'); })).toBe(true);
  });

  test('試合番号は IBM Plex Mono', async ({ page }) => {
    await open(page);
    await importNames(page, NAMES);
    await genTournament(page);
    const family = (sel) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontFamily);
    expect(await family('.ni-no')).toMatch(/^"?IBM Plex Mono"?,/);
  });

  test('表の SVG は画面のフォントで、PNG 用は端末のフォントで作る（PNG 出力は引き続き成功する）', async ({ page }) => {
    await open(page);
    await importNames(page, NAMES);
    await genTournament(page);
    expect(await page.locator('#bracket-wrap svg').first().getAttribute('font-family')).toMatch(/^'IBM Plex Sans JP',/);
    // 出力メニューから PNG をダウンロードできる（フォント指定が PNG 変換を壊さない）
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        const item = page.locator('[data-export=bracket-png]').first();
        if (!(await item.isVisible())) await item.locator('xpath=ancestor::*[contains(@class,"export-menu")]').locator('[data-export-toggle]').click();
        await item.click();
      })(),
    ]);
    expect(dl.suggestedFilename().endsWith('.png')).toBe(true);
  });
});
