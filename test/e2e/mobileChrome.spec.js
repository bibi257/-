import { test, expect } from '@playwright/test';
import { NAMES, open, importNames, genTournament } from './helpers.js';

const css = (loc, prop) => loc.evaluate((el, p) => getComputedStyle(el)[p], prop);

test.describe('スマホ幅（390px）のヘッダーとタブ', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('ヘッダーは1段。保存の状態は短い表記で、操作はメニューに入っている', async ({ page }) => {
    await open(page);
    await importNames(page, NAMES);
    const header = await page.locator('#app-header').boundingBox();
    expect(header.height).toBeLessThanOrEqual(56);
    // アプリ名・保存の状態・メニューが同じ段（縦の中心がそろう）
    for (const sel of ['.brand', '#save-status', '#menu-btn']) {
      const b = await page.locator(sel).boundingBox();
      expect(Math.abs(b.y + b.height / 2 - header.height / 2)).toBeLessThan(8);
    }
    await expect(page.locator('#menu-btn')).toHaveAttribute('aria-label', 'メニュー');
    await expect(page.locator('#menu-btn')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#header-actions')).toBeHidden();
    // 短い表記（「保存済み」）
    expect(await page.locator('#save-status').evaluate((el) => getComputedStyle(el, '::after').content)).toBe('"保存済み"');
  });

  test('メニューから全部の操作ができる（各行48px以上）。選ぶ・Esc・外側で閉じる', async ({ page }) => {
    await open(page);
    await page.tap('#menu-btn');
    await expect(page.locator('#menu-btn')).toHaveAttribute('aria-expanded', 'true');
    for (const act of ['new', 'save', 'load', 'print', 'share']) {
      const b = page.locator(`#header-actions [data-action=${act}]:not(#share-chip)`);
      await expect(b).toBeVisible();
      expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(48);
    }
    // 「共有」を選ぶと、共有の画面が開き、メニューは閉じる
    await page.tap('#header-actions [data-action=share]:not(#share-chip)');
    await expect(page.locator('#share-dialog')).toHaveJSProperty('open', true);
    await expect(page.locator('#header-actions')).toBeHidden();
    await page.keyboard.press('Escape');
    // Esc で閉じる
    await page.tap('#menu-btn');
    await expect(page.locator('#header-actions')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#header-actions')).toBeHidden();
    await expect(page.locator('#menu-btn')).toHaveAttribute('aria-expanded', 'false');
    // 外側を押して閉じる
    await page.tap('#menu-btn');
    await page.touchscreen.tap(200, 700);
    await expect(page.locator('#header-actions')).toBeHidden();
  });

  test('メニューの「保存」でファイルが保存できる', async ({ page }) => {
    await open(page);
    await importNames(page, NAMES);
    await page.tap('#menu-btn');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.tap('#header-actions [data-action=save]:not(#share-chip)')]);
    expect(dl.suggestedFilename()).toMatch(/\.json$/);
  });

  test('タブは見切れず1画面に収まり、全タブを順に開ける', async ({ page }) => {
    await open(page);
    await importNames(page, NAMES);
    await genTournament(page);
    const tabs = page.locator('.tabs');
    for (const name of ['setup', 'tournament', 'league', 'standings']) {
      await page.tap(`.tabs [data-tab=${name}]`);
      await expect(page.locator(`.tabs [data-tab=${name}]`)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator(`#panel-${name}`)).toBeVisible();
    }
    const m = await tabs.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
    for (const b of await tabs.locator('button:visible').all()) {
      const r = await b.boundingBox();
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(390.5);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('コメントのタブが加わっても見切れない', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { document.getElementById('tab-comments').hidden = false; });
    const tabs = page.locator('.tabs');
    const m = await tabs.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
    const last = await page.locator('#tab-comments').boundingBox();
    expect(last.x + last.width).toBeLessThanOrEqual(390.5);
  });

  test('スクロールしても、タブは画面の上端に固定される', async ({ page }) => {
    await open(page);
    await importNames(page, Array.from({ length: 30 }, (_, i) => `選手${i + 1}`));
    expect(await css(page.locator('.tabs'), 'position')).toBe('sticky');
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(150);
    const t = await page.locator('.tabs').boundingBox();
    expect(Math.round(t.y)).toBe(0);
    // ヘッダーは上にスクロールして消える
    const h = await page.locator('#app-header').boundingBox();
    expect(h.y + h.height).toBeLessThanOrEqual(0);
    // その位置からでもタブを押せる
    await genTournament(page);
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.tap('.tabs [data-tab=league]');
    await expect(page.locator('.tabs [data-tab=league]')).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('PC幅（1280px）は従来どおり', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('操作ボタンは並んだまま。メニューのボタンは出ない。タブは固定しない', async ({ page }) => {
    await open(page);
    await importNames(page, NAMES);
    await expect(page.locator('#menu-btn')).toBeHidden();
    for (const act of ['new', 'save', 'load', 'print', 'share']) await expect(page.locator(`#header-actions [data-action=${act}]:not(#share-chip)`)).toBeVisible();
    expect((await page.locator('#app-header').boundingBox()).height).toBeLessThanOrEqual(56);
    expect(await css(page.locator('.tabs'), 'position')).not.toBe('sticky');
    expect(await page.locator('#save-status').textContent()).toContain('自動保存');
  });

  test('印刷では、ヘッダーの操作・保存の状態・メニューは出ない', async ({ page }) => {
    await open(page);
    await importNames(page, NAMES);
    await page.emulateMedia({ media: 'print' });
    for (const sel of ['#save-status', '#menu-btn', '#header-actions', '.tabs']) await expect(page.locator(sel)).toBeHidden();
  });
});
