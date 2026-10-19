import { test, expect } from '@playwright/test';
import { open, importNames, enterScore, genTournament, openResultsFold } from './helpers.js';

const NAMES12 = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎', '田中 三郎', '伊藤 四郎', '渡辺 五郎', '中村 六子', '小林 七海', '加藤 八郎', '吉田 九太', 'ああああああああああ'];
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const pageHeight = (page) => page.evaluate(() => document.documentElement.scrollHeight);
const fold = (page) => page.locator('#panel-tournament details.fold');

async function make(page) {
  await open(page);
  await importNames(page, NAMES12);
  await genTournament(page);
  await expect(page.locator('#round-view')).toBeAttached();
}

test.describe('トーナメント（スマホ幅 390px）: 試合結果一覧の折りたたみ', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('12人: 「回戦ごと」のとき、結果一覧は閉じて見出しに件数が出る。ページの高さが以前（約3,000px）より短い', async ({ page }) => {
    await make(page);
    await expect(fold(page)).toHaveJSProperty('open', false);
    await expect(fold(page).locator('summary')).toContainText('試合結果一覧');
    await expect(fold(page).locator('summary')).toContainText('全11試合');
    await expect(fold(page).locator('.result-cards')).toBeHidden();
    // 回戦ごとのカードは出ている（同じ試合を2回並べない）
    await expect(page.locator('#round-view .rc').first()).toBeVisible();
    expect(await pageHeight(page)).toBeLessThanOrEqual(2000); // 以前は約3,000px。残りの大半は「進行状況」の欄（約830px。計画書の N5 で整理する）
    expect(await noOverflow(page)).toBe(true);
  });

  test('見出しで開閉できる。開いたまま保存して画面が作り直されても、開いたまま', async ({ page }) => {
    await make(page);
    await fold(page).locator('summary').tap();
    await expect(fold(page)).toHaveJSProperty('open', true);
    await expect(fold(page).locator('.result-cards li').first()).toBeVisible();
    // 一覧のカードから結果を保存する
    await fold(page).locator('.result-cards .rc.st-ready').first().tap();
    await enterScore(page, 3, 1);
    await expect(fold(page)).toHaveJSProperty('open', true);
    await fold(page).locator('summary').tap();
    await expect(fold(page)).toHaveJSProperty('open', false);
    // 回戦のカードから保存しても、閉じたまま
    await page.locator('#round-view .rc.st-ready').first().tap();
    await enterScore(page, 2, 0);
    await expect(fold(page)).toHaveJSProperty('open', false);
  });

  test('「表で見る」のときは常に開いたまま。「回戦ごと」に戻すと、前の開閉に戻る', async ({ page }) => {
    await make(page);
    await page.tap('[data-view-mode=table]');
    await expect(fold(page)).toHaveJSProperty('open', true);
    await fold(page).locator('summary').tap(); // 閉じられない
    await expect(fold(page)).toHaveJSProperty('open', true);
    await page.tap('[data-view-mode=rounds]');
    await expect(fold(page)).toHaveJSProperty('open', false);
  });

  test('印刷: 畳んでいても全試合の一覧を出し、印刷のあとは元の状態に戻る', async ({ page }) => {
    await make(page);
    await expect(fold(page)).toHaveJSProperty('open', false);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await expect(fold(page)).toHaveJSProperty('open', true);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#bracket-wrap svg')).toBeVisible(); // 印刷は表を出す
    await expect(page.locator('#round-view')).toBeHidden();
    await expect(fold(page).locator('.fold-count')).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(fold(page)).toHaveJSProperty('open', false);
  });

  test('結果の出力（試合結果の CSV・PNG）は、一覧を畳んでいても使える', async ({ page }) => {
    await make(page);
    await expect(fold(page)).toHaveJSProperty('open', false);
    await page.locator('#panel-tournament [data-export-toggle]').first().tap();
    await expect(page.locator('#panel-tournament [data-export=results-csv]')).toBeVisible();
    await expect(page.locator('#panel-tournament [data-export=results-png]')).toBeVisible();
  });
});

test.describe('トーナメント（PC幅 1280px）は今のまま', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('結果一覧の表は開いたままで、見出しを押しても閉じない。件数は出ない', async ({ page }) => {
    await make(page);
    await expect(fold(page)).toHaveJSProperty('open', true);
    await expect(page.locator('#panel-tournament .results-table')).toBeVisible();
    await expect(fold(page).locator('.fold-count')).toBeHidden();
    await fold(page).locator('summary').click();
    await expect(fold(page)).toHaveJSProperty('open', true);
    await openResultsFold(page); // PC 幅では何も起きない
    await expect(page.locator('#panel-tournament .results-table')).toBeVisible();
  });
});
