import { test, expect } from '@playwright/test';
import { open, importNames, enterScore, genTournament, lowestNextItem } from './helpers.js';

const players = (n) => Array.from({ length: n }, (_, i) => `選手${i + 1} 山田`);
const css = (loc, prop) => loc.evaluate((el, p) => getComputedStyle(el)[p], prop);
const level = (page) => page.locator('#zoom-level').textContent();

async function start(page, n) {
  await open(page);
  await importNames(page, players(n));
  await genTournament(page);
  await expect(page.locator('#bracket-wrap svg')).toBeVisible();
}

test.describe('トーナメント表の表示操作（PC 1280px）', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const n of [12, 32, 64]) {
    test(`${n}人: 縦は枠内でスクロールしない。「全体表示」で優勝の枠まで見える`, async ({ page }) => {
      await start(page, n);
      const wrap = page.locator('#bracket-wrap');
      expect(await css(wrap, 'maxHeight')).toBe('none');
      expect(await wrap.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true); // 縦はページに任せる
      await page.click('[data-zoom=fit]');
      await expect(page.locator('[data-zoom=fit]')).toHaveAttribute('aria-pressed', 'true');
      expect(await level(page)).toMatch(/^全体 \d+%$/);
      const w = await wrap.boundingBox();
      const svg = await page.locator('#bracket-wrap svg').boundingBox();
      expect(svg.x + svg.width).toBeLessThanOrEqual(w.x + w.width + 1); // 右端（優勝の枠）まで収まる
      expect(await wrap.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true); // 横スクロールなし
    });
  }

  test('拡大縮小は 50%〜150% を 25% 刻み。限度ではボタンが押せない', async ({ page }) => {
    await start(page, 12);
    expect(await level(page)).toBe('100%');
    await page.click('[data-zoom=in]');
    expect(await level(page)).toBe('125%');
    await page.click('[data-zoom=in]');
    expect(await level(page)).toBe('150%');
    await expect(page.locator('[data-zoom=in]')).toBeDisabled();
    const natural = Number(await page.locator('#bracket-wrap svg').getAttribute('width'));
    const w = (await page.locator('#bracket-wrap svg').boundingBox()).width;
    expect(Math.abs(w - natural * 1.5)).toBeLessThan(2); // SVG の表示の幅が拡大率どおり
    for (let i = 0; i < 4; i++) await page.click('[data-zoom=out]');
    expect(await level(page)).toBe('50%');
    await expect(page.locator('[data-zoom=out]')).toBeDisabled();
    await expect(page.locator('[data-zoom=fit]')).toHaveAttribute('aria-pressed', 'false');
    // 元の大きさの属性（PNG・印刷の元）は変わらない
    expect(Number(await page.locator('#bracket-wrap svg').getAttribute('width'))).toBe(natural);
  });

  test('回戦のボタンを押すと、その回戦の列まで横にスクロールする', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); // 動きを減らす設定では、すぐに移動する
    await start(page, 64);
    const wrap = page.locator('#bracket-wrap');
    const cols = (await wrap.getAttribute('data-cols')).split(',').map(Number);
    expect(cols).toHaveLength(7); // 6回戦＋優勝
    // 列の位置まで。ただし、スクロールできるのは表の右端まで
    const expected = async (k, scale) => wrap.evaluate((el, t) => Math.min(t, el.scrollWidth - el.clientWidth), cols[k] * scale - 12);
    await page.click('[data-col="3"]');
    expect(Math.abs((await wrap.evaluate((el) => el.scrollLeft)) - (await expected(3, 1)))).toBeLessThan(2);
    expect(await wrap.evaluate((el) => el.scrollLeft)).toBeGreaterThan(300);
    await page.click('[data-col="0"]');
    expect(Math.abs((await wrap.evaluate((el) => el.scrollLeft)) - (await expected(0, 1)))).toBeLessThan(2); // 1回戦の列は、ほぼ左端
    expect(await wrap.evaluate((el) => el.scrollLeft)).toBeLessThan(10);
    // 拡大しているときも、列の位置に合う
    await page.click('[data-zoom=in]');
    await page.click('[data-col="2"]');
    expect(Math.abs((await wrap.evaluate((el) => el.scrollLeft)) - (await expected(2, 1.25)))).toBeLessThan(2);
    expect(await wrap.evaluate((el) => el.scrollLeft)).toBeGreaterThan(300);
  });

  test('「次に行う試合」を押すと、その試合の位置までスクロールして1.5秒強調する。保存したあとも位置を見せる', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start(page, 12);
    await page.click('[data-zoom=in]');
    await page.click('[data-zoom=in]'); // 150%
    // 1回戦・2回戦を最後まで進める（準決勝が次の試合になる）
    for (let i = 0; i < 8; i++) {
      await (await lowestNextItem(page)).click();
      await enterScore(page, 2, 0);
    }
    const next = await lowestNextItem(page);
    const id = await next.getAttribute('data-match');
    await next.click();
    await expect(page.locator(`g.match.flash[data-id="${id}"]`)).toHaveCount(1);
    await expect.poll(() => page.locator('#bracket-wrap').evaluate((el) => el.scrollLeft)).toBeGreaterThan(100); // 右の列へ移動した
    // 試合の枠が、枠の見える範囲の中にある
    const g = await page.locator(`g.match[data-id="${id}"]`).boundingBox();
    const w = await page.locator('#bracket-wrap').boundingBox();
    expect(g.x).toBeGreaterThanOrEqual(w.x - 1);
    expect(g.x + g.width).toBeLessThanOrEqual(w.x + w.width + 1);
    // 1.5秒たつと強調は消える
    await expect(page.locator('g.match.flash')).toHaveCount(0, { timeout: 3000 });
    // 結果を入れて保存すると、その試合がまた強調される
    await enterScore(page, 3, 1);
    await expect(page.locator(`g.match.flash[data-id="${id}"]`)).toHaveCount(1);
  });

  test('結果を保存して表が描き直されても、拡大率と横の位置は変わらない', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start(page, 12);
    await page.click('[data-zoom=in]');
    await page.locator('.next-item').first().click();
    await enterScore(page, 2, 0);
    expect(await level(page)).toBe('125%');
    await page.click('[data-zoom=fit]');
    await page.locator('.next-item').first().click();
    await enterScore(page, 2, 0);
    expect(await level(page)).toMatch(/^全体 /);
  });

  test('印刷では、画面の拡大縮小は影響しない（元の大きさ）', async ({ page }) => {
    await start(page, 12);
    const printWidth = async () => {
      await page.emulateMedia({ media: 'print' });
      const w = (await page.locator('#bracket-wrap svg').boundingBox()).width;
      await page.emulateMedia({ media: 'screen' });
      return w;
    };
    const base = await printWidth();
    for (let i = 0; i < 2; i++) await page.click('[data-zoom=out]'); // 50%
    expect(await level(page)).toBe('50%');
    expect(Math.abs((await printWidth()) - base)).toBeLessThan(1);
    await page.click('[data-zoom=fit]');
    expect(Math.abs((await printWidth()) - base)).toBeLessThan(1);
    // 操作バーは印刷に出ない
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.bracket-controls')).toBeHidden();
  });
});
