import { test, expect } from '@playwright/test';
import { open, importNames, genTournament, enterScore, lowestNextItem } from './helpers.js';

const FOUR = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎'];

async function openWindow(page, context) {
  await page.click('[data-call=tournament]');
  const [popup] = await Promise.all([context.waitForEvent('page'), page.click('#cs-window')]);
  await popup.waitForSelector('#call-screen[open]');
  return popup;
}

async function setup(page) {
  await open(page);
  await importNames(page, FOUR);
  await genTournament(page);
}

test.describe('呼び出し画面を別ウィンドウで開く（N9）', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('開くと、元の画面の呼び出し画面は閉じ、別ウィンドウは呼び出し画面だけを出す（ヘッダー・タブ・入力は出さない）', async ({ page, context }) => {
    await setup(page);
    const popup = await openWindow(page, context);
    await expect(page.locator('#call-screen')).not.toBeVisible(); // 元の画面の呼び出し画面は閉じる
    expect(popup.url()).toContain('view=call');
    expect(popup.url()).toContain('kind=tournament');
    await expect(popup.locator('#cs-sub')).toHaveText('トーナメント');
    await expect(popup.locator('.cs-card').first()).toBeVisible();
    for (const sel of ['#app-header', '.tabs', '#panel-tournament', '#result-dialog']) await expect(popup.locator(sel)).toBeHidden();
    await expect(popup.locator('#cs-close')).toBeHidden();
    await expect(popup.locator('#cs-window')).toBeHidden();
    await expect(popup.locator('#cs-full')).toBeVisible();
    expect(await popup.title()).toContain('呼び出し画面');
  });

  test('元の画面で結果を入れると、別ウィンドウの表示がすぐに変わる', async ({ page, context }) => {
    await setup(page);
    const popup = await openWindow(page, context);
    await expect(popup.locator('#cs-progress')).toHaveText('0 / 3 試合終了');
    await (await lowestNextItem(page, '#panel-tournament')).click();
    await enterScore(page, 2, 0);
    await expect(popup.locator('#cs-progress')).toHaveText('1 / 3 試合終了');
    // もう1試合入れる
    await (await lowestNextItem(page, '#panel-tournament')).click();
    await enterScore(page, 2, 1);
    await expect(popup.locator('#cs-progress')).toHaveText('2 / 3 試合終了');
  });

  test('BroadcastChannel が使えない環境でも、localStorage の storage イベントで更新される', async ({ page, context }) => {
    await context.addInitScript(() => { delete window.BroadcastChannel; });
    await setup(page);
    const popup = await openWindow(page, context);
    expect(await popup.evaluate(() => typeof BroadcastChannel)).toBe('undefined');
    await (await lowestNextItem(page, '#panel-tournament')).click();
    await enterScore(page, 2, 0);
    await expect(popup.locator('#cs-progress')).toHaveText('1 / 3 試合終了');
  });

  test('別ウィンドウは読み取り専用: 自動保存を上書きせず、閉じる操作（Esc）でも閉じない', async ({ page, context }) => {
    await setup(page);
    const before = await page.evaluate(() => localStorage.getItem('bukatsu-taikai:state'));
    const popup = await openWindow(page, context);
    await popup.keyboard.press('Escape');
    await popup.keyboard.press('Escape');
    await expect(popup.locator('#call-screen')).toBeVisible();
    await expect(popup.locator('#call-screen')).toHaveJSProperty('open', true);
    // 別ウィンドウを開いただけでは、保存データは変わらない
    expect(await page.evaluate(() => localStorage.getItem('bukatsu-taikai:state'))).toBe(before);
    // 共有のボタンなども出ない（読み取り専用）
    await expect(popup.locator('.header-actions')).toBeHidden();
  });

  test('1回の保存で、別ウィンドウは1回だけ描き直す（BroadcastChannel と storage の両方が届いても）', async ({ page, context }) => {
    await setup(page);
    const popup = await openWindow(page, context);
    await popup.evaluate(() => {
      window.__draws = 0;
      new MutationObserver((recs) => { window.__draws += recs.some((r) => r.type === 'childList') ? 1 : 0; }).observe(document.getElementById('cs-body'), { childList: true });
    });
    await (await lowestNextItem(page, '#panel-tournament')).click();
    await enterScore(page, 2, 0);
    await expect(popup.locator('#cs-progress')).toHaveText('1 / 3 試合終了');
    await popup.waitForTimeout(500); // 2つ目の通知が遅れて届く時間を待つ
    expect(await popup.evaluate(() => window.__draws)).toBe(1);
  });

  test('運営の画面を閉じても、別ウィンドウは最後の内容を出し続ける', async ({ page, context }) => {
    await setup(page);
    const popup = await openWindow(page, context);
    await (await lowestNextItem(page, '#panel-tournament')).click();
    await enterScore(page, 2, 0);
    await expect(popup.locator('#cs-progress')).toHaveText('1 / 3 試合終了');
    await page.close();
    await expect(popup.locator('#cs-progress')).toHaveText('1 / 3 試合終了');
    await expect(popup.locator('.cs-card').first()).toBeVisible();
  });

  test('総当たりの呼び出し画面も別ウィンドウで開ける（kind=league）', async ({ page, context }) => {
    await open(page);
    await importNames(page, FOUR);
    await page.click('[data-act=gen-league]');
    await page.waitForSelector('#panel-league .progress');
    await page.click('[data-call=league]');
    const [popup] = await Promise.all([context.waitForEvent('page'), page.click('#cs-window')]);
    await popup.waitForSelector('#call-screen[open]');
    expect(popup.url()).toContain('kind=league');
    await expect(popup.locator('#cs-sub')).toHaveText('総当たり');
  });

  test('「全画面」は別ウィンドウの中でも使える', async ({ page, context }) => {
    await setup(page);
    const popup = await openWindow(page, context);
    await popup.click('#cs-full');
    await expect.poll(() => popup.evaluate(() => document.fullscreenElement?.tagName ?? null)).toBe('HTML');
  });

  test('ポップアップを開けないときは、通知を出して元の呼び出し画面を残す', async ({ page }) => {
    await page.addInitScript(() => { window.open = () => null; });
    await setup(page);
    await page.click('[data-call=tournament]');
    await page.click('#cs-window');
    await expect(page.locator('#call-screen')).toBeVisible();
    await expect(page.locator('#toast')).toContainText('別ウィンドウを開けませんでした');
  });
});
