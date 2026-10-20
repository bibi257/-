import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
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
    expect(await family('.tc-no')).toMatch(/^"?IBM Plex Mono"?,/);
  });

  test('PNG 出力は画面と同じフォントで、画面の表と同じ大きさ・配置の画像になる（N14）', async ({ page }) => {
    await open(page);
    await importNames(page, NAMES);
    await genTournament(page);
    const svg = page.locator('#bracket-wrap svg').first();
    expect(await svg.getAttribute('font-family')).toMatch(/^'IBM Plex Sans JP',/);
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        const item = page.locator('[data-export=bracket-png]').first();
        if (!(await item.isVisible())) await item.locator('xpath=ancestor::*[contains(@class,"export-menu")]').locator('[data-export-toggle]').click();
        await item.click();
      })(),
    ]);
    expect(dl.suggestedFilename().endsWith('.png')).toBe(true);
    const png = await readFile(await dl.path());
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    // 画像の大きさは、画面の表（IBM Plex で測った SVG）の 2 倍。端末のフォントで測り直していない
    const [w, h] = await svg.evaluate((el) => [Number(el.getAttribute('width')), Number(el.getAttribute('height'))]);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([w * 2, h * 2]);
  });
});
