import { test, expect } from '@playwright/test';
import { open, importNames, enterScore, openResultsFold } from './helpers.js';

const NAMES12 = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎', '田中 三郎', '伊藤 四郎', '渡辺 五郎', '中村 六子', '小林 七海', '加藤 八郎', '吉田 九太', 'ああああああああああ'];
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const pageHeight = (page) => page.evaluate(() => document.documentElement.scrollHeight);

async function makeLeague(page, names = NAMES12) {
  await open(page);
  await importNames(page, names);
  await page.click('[data-act=gen-league]');
  await page.waitForSelector('#league-round-view .round-tabs', { state: 'attached' }); // PC 幅では隠れている
}

const roundCards = (page) => page.locator('#league-round-view .result-cards .rc');

test.describe('総当たり（スマホ幅 390px）: 回戦ごと・選手ごと・折りたたみ', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('12人: 初期は1回戦の6試合だけを出し、ページが長くならず、横スクロールも出ない。結果一覧は閉じている', async ({ page }) => {
    await makeLeague(page);
    await expect(page.locator('#league-round-view .round-tabs button')).toHaveCount(11);
    await expect(page.locator('#league-round-view [aria-selected=true]')).toHaveText('1回戦');
    await expect(roundCards(page)).toHaveCount(6);
    expect(await pageHeight(page)).toBeLessThanOrEqual(2200); // 以前は約7,800px。残りの大半は「進行状況」の欄（約1,040px。計画書の N5 で整理する）
    expect(await noOverflow(page)).toBe(true);
    // 対戦表（横に長い）は隠れ、結果一覧は閉じて、件数が見出しに出る
    await expect(page.locator('.matrix')).toBeHidden();
    await expect(page.locator('details.fold')).toHaveJSProperty('open', false);
    await expect(page.locator('details.fold summary')).toContainText('試合結果一覧');
    await expect(page.locator('details.fold summary')).toContainText('66試合');
    await expect(page.locator('.results-fold .result-cards').first()).toBeHidden();
  });

  test('回戦のタブで切り替わる。カードをタップして保存すると強調され、回戦が全部終わっても、その回戦のまま', async ({ page }) => {
    await makeLeague(page);
    await page.locator('#league-round-view [data-round-tab="3"]').tap();
    await expect(page.locator('#league-round-view [aria-selected=true]')).toHaveText('3回戦');
    await expect(roundCards(page).first()).toContainText('3回戦');
    await page.locator('#league-round-view [data-round-tab="1"]').tap();
    for (let i = 0; i < 6; i++) {
      await roundCards(page).locator('xpath=self::*[contains(@class,"st-ready")]').first().tap();
      await page.fill('#rd-s1', '3');
      await page.fill('#rd-s2', '1');
      await page.tap('#rd-ok');
      if (i === 0) await expect(page.locator('#league-round-view .rc.flash')).toHaveCount(1); // 保存した試合を強調
    }
    await expect(page.locator('#league-round-view .rc.st-done')).toHaveCount(6);
    await expect(page.locator('#league-round-view [aria-selected=true]')).toHaveText('1回戦'); // 勝手に2回戦へ移らない
  });

  test('奇数人数（11人）: 回戦のカードの下に「休み：○○」が1人出る', async ({ page }) => {
    await makeLeague(page, NAMES12.slice(0, 11));
    await expect(page.locator('#league-round-view .round-tabs button')).toHaveCount(11);
    await expect(roundCards(page)).toHaveCount(5);
    await expect(page.locator('#league-round-view .round-rest')).toHaveText(/^休み：.+$/);
    // 偶数人数では出ない
    await makeLeague(page);
    await expect(page.locator('#league-round-view .round-rest')).toHaveCount(0);
  });

  test('「対戦表で見る」: 選手を選ぶと、その選手の対戦だけを縦のリストで出す。「すべて」は今の横スクロールの対戦表', async ({ page }) => {
    await makeLeague(page);
    // 1試合だけ結果を入れる（山田 太郎の1回戦）
    await roundCards(page).filter({ hasText: '山田 太郎' }).first().tap();
    await page.fill('#rd-s1', '3');
    await page.fill('#rd-s2', '1');
    await page.tap('#rd-ok');
    await page.tap('[data-view-mode=table]');
    await expect(page.locator('#league-round-view')).toBeHidden();
    await expect(page.locator('.matrix')).toBeVisible(); // 初期は「すべて」＝対戦表
    await expect(page.locator('#lp-player')).toHaveValue('all');
    await expect(page.locator('#league-player-list')).toBeHidden();
    const wrap = page.locator('.matrix-card .table-wrap');
    expect(await wrap.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true); // 横にスクロールする

    await page.selectOption('#lp-player', { label: '山田 太郎' });
    await expect(page.locator('.matrix')).toBeHidden();
    const rows = page.locator('#league-player-list .pl-row');
    await expect(rows).toHaveCount(11);
    expect(await noOverflow(page)).toBe(true);
    // 1回戦は終了（○ 3-1 か × 1-3 ではなく、山田から見た結果）。ほかは未実施
    const first = rows.first();
    await expect(first).toContainText('1回戦');
    await expect(first.locator('.pl-result')).toHaveText(/^[○×] \d-\d$/);
    await expect(rows.nth(1).locator('.pl-result')).toHaveText('未実施');
    // リストから結果入力が開く
    await rows.nth(1).tap();
    await expect(page.locator('#result-dialog')).toHaveJSProperty('open', true);
    await page.fill('#rd-s1', '0');
    await page.fill('#rd-s2', '2');
    await page.tap('#rd-ok');
    await expect(rows.nth(1).locator('.pl-result')).toHaveText(/^[○×] \d-\d$/);
    // 「すべて」に戻すと対戦表
    await page.selectOption('#lp-player', 'all');
    await expect(page.locator('.matrix')).toBeVisible();
    await expect(page.locator('#league-player-list')).toBeHidden();
  });

  test('「自分の試合」で名前を選んでいれば、「対戦表で見る」の初期値はその名前', async ({ page }) => {
    await makeLeague(page);
    await page.tap('[data-my-toggle=on]');
    await page.fill('#my-name', '佐藤 花子');
    await page.tap('[data-view-mode=table]');
    await expect(page.locator('#lp-player option:checked')).toHaveText('佐藤 花子');
    await expect(page.locator('#league-player-list .pl-row')).toHaveCount(11);
  });

  test('結果一覧の折りたたみ: 見出しで開閉でき、保存して画面が作り直されても開いたまま。絞り込みは一覧の中だけに効く', async ({ page }) => {
    await makeLeague(page);
    await openResultsFold(page);
    await expect(page.locator('details.fold')).toHaveJSProperty('open', true);
    await expect(page.locator('.results-fold .result-cards li')).toHaveCount(66);
    await page.selectOption('#mf-round', '2');
    await expect(page.locator('#mf-count')).toHaveText('66試合中 6試合を表示');
    await expect(roundCards(page)).toHaveCount(6); // 回戦ごとの表示は、絞り込みの影響を受けない（1回戦のまま）
    await expect(page.locator('#league-round-view [aria-selected=true]')).toHaveText('1回戦');
    // 一覧のカードから保存しても、折りたたみは開いたまま
    await page.locator('.results-fold .result-cards [data-match]:visible').first().tap();
    await page.fill('#rd-s1', '1');
    await page.fill('#rd-s2', '0');
    await page.tap('#rd-ok');
    await expect(page.locator('details.fold')).toHaveJSProperty('open', true);
    await page.locator('details.fold summary').tap();
    await expect(page.locator('details.fold')).toHaveJSProperty('open', false);
  });

  test('印刷: 対戦表と全試合の一覧を出し、回戦ごと・選手ごとの表示は出さない。畳んでいても全試合が出る', async ({ page }) => {
    await makeLeague(page);
    await expect(page.locator('details.fold')).toHaveJSProperty('open', false);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await expect(page.locator('details.fold')).toHaveJSProperty('open', true);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.matrix')).toBeVisible();
    await expect(page.locator('#league-round-view')).toBeHidden();
    await expect(page.locator('.view-switch')).toBeHidden();
    await expect(page.locator('.player-pick')).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('details.fold')).toHaveJSProperty('open', false); // 印刷のあと、元の状態に戻る
  });
});

test.describe('総当たり（PC幅 1280px）は今のまま', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('対戦表と試合結果一覧の表がそのまま出て、切り替え・タブ・選手の選択は出ない。結果一覧は閉じられない', async ({ page }) => {
    await makeLeague(page);
    await expect(page.locator('.matrix')).toBeVisible();
    await expect(page.locator('.results-table')).toBeVisible();
    await expect(page.locator('#league-round-view')).toBeHidden();
    await expect(page.locator('.view-switch')).toBeHidden();
    await expect(page.locator('.player-pick')).toBeHidden();
    await expect(page.locator('.fold-count')).toBeHidden();
    await page.locator('details.fold summary').click(); // 見出しを押しても閉じない
    await expect(page.locator('details.fold')).toHaveJSProperty('open', true);
    await expect(page.locator('.results-table')).toBeVisible();
    // 結果入力は、マスから従来どおり
    await page.locator('.matrix td.cell').first().click();
    await enterScore(page, 2, 1);
    await expect(page.locator('.matrix td.cell.win, .matrix td.cell.loss').first()).toBeVisible();
  });
});
