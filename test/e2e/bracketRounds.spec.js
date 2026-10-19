import { test, expect } from '@playwright/test';
import { open, importNames, enterScore, genTournament } from './helpers.js';

const players = (n) => Array.from({ length: n }, (_, i) => `選手${i + 1} 山田`);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function start(page, n, { third = false } = {}) {
  await open(page);
  await importNames(page, players(n));
  if (third) await page.check('#third-place');
  await genTournament(page);
  await expect(page.locator('#round-view')).toBeVisible();
}
const tab = (page, key) => page.locator(`#round-view [data-round-tab="${key}"]`);
const cards = (page) => page.locator('#round-view .rc');

test.describe('スマホ幅（390px）: トーナメントは「回戦ごと」が初期表示', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  for (const n of [12, 32]) {
    test(`${n}人: 回戦のタブと試合のカード。表は隠れ、横スクロールが出ない`, async ({ page }) => {
      await start(page, n);
      await expect(page.locator('#bracket-wrap')).toBeHidden();
      await expect(page.locator('.bracket-controls')).toBeHidden();
      await expect(page.locator('[data-view-mode=rounds]')).toHaveAttribute('aria-pressed', 'true');
      const R = Math.ceil(Math.log2(n));
      await expect(page.locator('#round-view [role=tab]')).toHaveCount(R);
      await expect(tab(page, '1')).toHaveAttribute('aria-selected', 'true'); // 試合待ちがある最初の回戦
      expect(await cards(page).count()).toBeGreaterThan(0);
      expect(await noOverflow(page)).toBe(true);
      // 最後の回戦（決勝）は1試合
      await tab(page, String(R)).tap();
      await expect(tab(page, String(R))).toHaveAttribute('aria-selected', 'true');
      await expect(cards(page)).toHaveCount(1);
      await expect(cards(page).first()).toContainText('（未定）');
      expect(await noOverflow(page)).toBe(true);
    });
  }

  test('カードをタップすると結果入力が開き、保存するとカードが「終了」になる。「表で見る」で今の表に切り替わる', async ({ page }) => {
    await start(page, 12);
    const ready = page.locator('#round-view .rc.st-ready').first();
    await ready.tap();
    await expect(page.locator('#result-dialog')).toHaveJSProperty('open', true);
    await page.fill('#rd-s1', '3');
    await page.fill('#rd-s2', '1');
    await page.tap('#rd-ok');
    await expect(page.locator('#round-view .rc.st-done').first().locator('.rc-score')).toHaveText('3 － 1');
    // 「表で見る」: 今の SVG の表（拡大縮小つき）。回戦ごとの表示は隠れる
    await page.tap('[data-view-mode=table]');
    await expect(page.locator('#bracket-wrap')).toBeVisible();
    await expect(page.locator('.bracket-controls')).toBeVisible();
    await expect(page.locator('#round-view')).toBeHidden();
    await expect(page.locator('[data-view-mode=table]')).toHaveAttribute('aria-pressed', 'true');
    // 表でも、試合を押すと結果入力が開く
    await page.locator('#bracket-wrap g.match.st-ready').first().tap();
    await expect(page.locator('#result-dialog')).toHaveJSProperty('open', true);
    await page.tap('#rd-cancel');
    // 「回戦ごと」に戻せる
    await page.tap('[data-view-mode=rounds]');
    await expect(page.locator('#round-view')).toBeVisible();
    await expect(page.locator('#bracket-wrap')).toBeHidden();
  });

  test('「次に行う試合」から入力して保存すると、その試合の回戦のタブを見せる', async ({ page }) => {
    await start(page, 12);
    await tab(page, '3').tap();
    await page.locator('.next-item').first().tap(); // 1回戦の試合を入力（次に行う試合）
    await expect(page.locator('#result-dialog')).toHaveJSProperty('open', true);
    await page.fill('#rd-s1', '2');
    await page.fill('#rd-s2', '0');
    await page.tap('#rd-ok');
    // 「次に行う試合」から開いて保存すると、その試合の回戦（1回戦）を見せる
    await expect(tab(page, '1')).toHaveAttribute('aria-selected', 'true');
  });

  test('「次に行う試合」を押すと、その回戦のタブを開いてカードを1.5秒強調する', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start(page, 12);
    // 1回戦を最後まで進める
    for (let i = 0; i < 4; i++) {
      await page.locator('.next-item').first().tap();
      await enterScore(page, 2, 0);
    }
    await tab(page, '4').tap(); // 別の回戦を見ている状態から
    const next = page.locator('.next-item').first();
    const id = await next.getAttribute('data-match');
    await next.tap();
    await expect(tab(page, '2')).toHaveAttribute('aria-selected', 'true'); // 2回戦のタブに移る
    await expect(page.locator(`#round-view [data-match="${id}"].flash`)).toHaveCount(1);
    await expect(page.locator('#round-view .flash')).toHaveCount(0, { timeout: 3000 }); // 1.5秒で消える
  });

  test('3位決定戦があれば、最後のタブになる', async ({ page }) => {
    await start(page, 8, { third: true });
    await expect(page.locator('#round-view [role=tab]')).toHaveCount(4); // 準々決勝・準決勝・決勝・3位決定戦
    await expect(tab(page, 'third')).toHaveText('3位決定戦');
    await tab(page, 'third').tap();
    await expect(cards(page)).toHaveCount(1);
  });

  test('総当たりには影響しない（カードの結果一覧のまま）', async ({ page }) => {
    await open(page);
    await importNames(page, players(6));
    await page.click('[data-act=gen-league]');
    await expect(page.locator('.result-cards li').first()).toBeVisible();
    await expect(page.locator('#round-view')).toHaveCount(0);
  });
});

test.describe('PC幅（1280px）は今までどおり表だけ', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('回戦ごとの表示と切り替えは出ない', async ({ page }) => {
    await open(page);
    await importNames(page, players(12));
    await genTournament(page);
    await expect(page.locator('#bracket-wrap')).toBeVisible();
    await expect(page.locator('.bracket-controls')).toBeVisible();
    await expect(page.locator('#round-view')).toBeHidden();
    await expect(page.locator('.view-switch')).toBeHidden();
  });

  test('印刷では（スマホ幅でも）、回戦ごとの表示は出ず、表が出る', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await importNames(page, players(12));
    await genTournament(page);
    await expect(page.locator('#round-view')).toBeVisible(); // スマホ幅では回戦ごと
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#round-view')).toBeHidden();
    await expect(page.locator('#bracket-wrap')).toBeVisible();
  });
});
