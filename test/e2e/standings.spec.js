import { test, expect } from '@playwright/test';
import { NAMES, open, importNames, enterScore, download } from './helpers.js';

const css = (loc, prop) => loc.evaluate((el, p) => getComputedStyle(el)[p], prop);

async function setup(page) {
  await open(page);
  await importNames(page, NAMES.slice(0, 4));
  await page.click('[data-act=gen-tournament]');
}
async function play(page, a, b) {
  await page.locator('.tab-panel:not([hidden]) .next-item').first().click();
  await enterScore(page, a, b);
}

test.describe('トーナメントの順位表', () => {
  test('途中: 勝ち残りが上で、順位の欄に「勝ち残り」のバッジ。敗退した選手は下', async ({ page }) => {
    await setup(page);
    await play(page, 3, 1); // 準決勝の1試合目だけ終える
    await page.click('[data-tab=standings]');
    const rows = page.locator('table.standings tbody tr');
    await expect(rows).toHaveCount(4);
    await expect(page.locator('table.standings tbody tr.st-alive')).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(rows.nth(i)).toHaveClass(/st-alive/);
      await expect(rows.nth(i).locator('td').first().locator('.badge-alive')).toHaveText('勝ち残り');
    }
    // 敗退した選手（3位）は一番下。順位の数字が出る
    await expect(rows.nth(3).locator('td').first()).toHaveText('3');
    await expect(rows.nth(3)).toContainText('3位');
    await expect(page.locator('table.standings tr[class*=medal-]')).toHaveCount(0); // 途中は帯なし
    await expect(page.locator('#panel-standings .hint').first()).toContainText('「勝ち残り」と出します');
    // CSV の並びも画面と同じ（勝ち残りが先、順位の欄は空欄）
    const csv = (await download(page, '[data-export=t-csv]')).bytes.toString('utf8').split('\r\n').filter(Boolean);
    expect(csv.slice(1, 4).every((l) => l.includes('勝ち残り'))).toBe(true);
    expect(csv[4]).toContain('3位');
  });

  test('大会が終わると、1〜3位の行の左に金・銀・銅の帯（4px）', async ({ page }) => {
    await setup(page);
    await play(page, 3, 1);
    await play(page, 2, 0);
    await play(page, 2, 1);
    await page.click('[data-tab=standings]');
    await expect(page.locator('table.standings tbody tr.st-alive')).toHaveCount(0);
    const rows = page.locator('table.standings tbody tr');
    await expect(rows.nth(0)).toHaveClass(/medal-gold/);
    await expect(rows.nth(1)).toHaveClass(/medal-silver/);
    await expect(rows.nth(2)).toHaveClass(/medal-bronze/);
    await expect(rows.nth(3)).toHaveClass(/medal-bronze/); // 3位決定戦なしなので3位は2人
    const band = async (i) => css(rows.nth(i).locator('td').first(), 'boxShadow');
    expect(await band(0)).toContain('rgb(224, 168, 0)');
    expect(await band(1)).toContain('rgb(154, 165, 177)');
    expect(await band(2)).toContain('rgb(184, 115, 51)');
    expect(await band(0)).toMatch(/inset/);
    expect(await band(0)).toMatch(/4px/);
    // 順位の数字は帯と別に出ている（色だけに頼らない）
    await expect(rows.nth(0).locator('td').first()).toHaveText('1');
    await expect(rows.nth(1).locator('td').first()).toHaveText('2');
  });
});
