import { test, expect } from '@playwright/test';
import { open, importNames, genTournament } from './helpers.js';

const FOUR = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎'];
const fsTag = (page) => page.evaluate(() => (document.fullscreenElement ? document.fullscreenElement.tagName : null));

test('呼び出し画面の「全画面」: 押すと全画面になり、画面は開いたまま。もう一度押す・閉じるで全画面が終わる', async ({ page }) => {
  await open(page);
  await importNames(page, FOUR);
  await genTournament(page);
  await page.click('[data-call=tournament]');
  await expect(page.locator('#call-screen')).toBeVisible();
  await expect(page.locator('#cs-full')).toBeVisible();
  expect(await fsTag(page)).toBeNull();

  await page.click('#cs-full');
  await expect.poll(() => fsTag(page)).toBe('HTML'); // <dialog> 自体は全画面にできないので、ページ全体
  await expect(page.locator('#call-screen')).toBeVisible();
  // 画面の中央に、呼び出し画面の中身が出ている（ほかの要素に隠れていない）
  const covered = await page.evaluate(() => !document.getElementById('call-screen').contains(document.elementFromPoint(innerWidth / 2, innerHeight / 2)));
  expect(covered).toBe(false);
  await expect(page.locator('#qr-dialog')).toBeHidden(); // 開いていないダイアログは、全画面でも出ない

  await page.click('#cs-full');
  await expect.poll(() => fsTag(page)).toBeNull();

  await page.click('#cs-full');
  await expect.poll(() => fsTag(page)).toBe('HTML');
  await page.click('#cs-close'); // 閉じると、全画面も終わる
  await expect.poll(() => fsTag(page)).toBeNull();
  await expect(page.locator('#call-screen')).not.toBeVisible();
});

test('全画面にできない環境（要素の全画面に対応していない）では、「全画面」のボタンを出さない', async ({ page }) => {
  await page.addInitScript(() => { Element.prototype.requestFullscreen = undefined; });
  await open(page);
  await importNames(page, FOUR);
  await genTournament(page);
  await page.click('[data-call=tournament]');
  await expect(page.locator('#call-screen')).toBeVisible();
  await expect(page.locator('#cs-full')).toBeHidden();
});

test('全画面にできなかったときは、何も起きないままにせず、通知を出す', async ({ page }) => {
  await open(page);
  await importNames(page, FOUR);
  await genTournament(page);
  await page.evaluate(() => { document.documentElement.requestFullscreen = () => Promise.reject(new TypeError('拒否')); });
  await page.click('[data-call=tournament]');
  await page.click('#cs-full');
  await expect(page.locator('#toast')).toContainText('全画面にできませんでした');
});
