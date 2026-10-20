import { test, expect } from '@playwright/test';
import { open, importNames, setNumber, genTournament, enterScore } from './helpers.js';

const NAMES12 = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎', '田中 三郎', '伊藤 四郎', '渡辺 五郎', '中村 六子', '小林 七海', '加藤 八郎', '吉田 九太', 'ああああああああああ'];
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const pageHeight = (page) => page.evaluate(() => document.documentElement.scrollHeight);
const cards = (page, kind = 'tournament') => page.locator(`#panel-${kind} .table-board .tc`);

async function make(page, tables, kind = 'tournament') {
  await open(page);
  await importNames(page, NAMES12);
  await setNumber(page, '#table-count', tables);
  if (kind === 'league') await page.click('[data-act=gen-league]');
  else await genTournament(page);
  await expect(cards(page, kind)).toHaveCount(tables);
}

for (const [w, h] of [[390, 844], [1280, 900]]) {
  test.describe(`進行状況の卓ごとのカード（幅${w}px）`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: w < 700 });

    for (const tables of [1, 2, 4]) {
      test(`卓${tables}つ: 試合が重複して出ず、卓ごとに1枚。ボタンはカードの中。横スクロールなし`, async ({ page }) => {
        await make(page, tables);
        // 「次に行う試合」の別の一覧（同じ試合の2回目）は無い。卓の外に「開始」ボタンも無い
        await expect(page.locator('#panel-tournament .next-list')).toHaveCount(0);
        await expect(page.locator('#panel-tournament [data-start]:not(.table-board [data-start])')).toHaveCount(0);
        for (let i = 0; i < tables; i++) {
          const c = cards(page).nth(i);
          await expect(c.locator('.tc-name')).toHaveText(`第${i + 1}卓`);
          await expect(c.locator('.tc-line')).toHaveCount(2); // 「今」と「次」
          await expect(c.locator('.tc-line').nth(0)).toContainText('空き');
          const start = c.locator('[data-start]');
          await expect(start).toHaveText('開始');
          // ボタンはカードの中の右端で、押しやすい高さ（44px 以上）
          const cb = await c.boundingBox();
          const bb = await start.boundingBox();
          expect(bb.x + bb.width).toBeLessThanOrEqual(cb.x + cb.width + 1);
          expect(bb.x).toBeGreaterThan(cb.x + cb.width / 2);
          expect(bb.height).toBeGreaterThanOrEqual(44);
        }
        expect(await noOverflow(page)).toBe(true);
        // 試合番号は、カードの間で重ならない（同じ試合が2つの卓に出ない）
        const nos = await cards(page).locator('.tc-line:nth-child(2) .tc-no').allTextContents();
        expect(new Set(nos).size).toBe(nos.length);
      });
    }

    test('卓が2つで、2試合が同時に進行中: 両方の卓が進行中になり、それぞれ「結果を入力」。「今」「次」の行を押すと結果入力が開く', async ({ page }) => {
      await make(page, 2);
      await cards(page).nth(0).locator('[data-start]').click();
      await cards(page).nth(1).locator('[data-start]').click();
      await expect(page.locator('#panel-tournament .table-board .tc.busy')).toHaveCount(2);
      await expect(page.locator('#panel-tournament .table-board .tc-action [data-match]')).toHaveText(['結果を入力', '結果を入力']);
      await expect(page.locator('#panel-tournament .table-board [data-start]')).toHaveCount(0);
      expect(await noOverflow(page)).toBe(true);
      // 「次」の行を押すと、その卓の次の試合の結果入力が開く
      await cards(page).nth(0).locator('.tc-line').nth(1).locator('.next-item').click();
      await expect(page.locator('#result-dialog')).toHaveJSProperty('open', true);
      await expect(page.locator('#rd-unstart')).toBeHidden(); // 開始していない試合
      await page.click('#rd-cancel');
      // 「今」の行（進行中の試合）を開くと、「開始を取り消す」がある
      await cards(page).nth(0).locator('.tc-line').nth(0).locator('.next-item').click();
      await expect(page.locator('#rd-unstart')).toBeVisible();
      await page.click('#rd-cancel');
      // 「結果を入力」ボタンも、同じ試合の結果入力を開く
      await cards(page).nth(1).locator('.tc-action [data-match]').click();
      await enterScore(page, 2, 1);
      await expect(cards(page).nth(1)).toHaveClass(/free/);
      await expect(cards(page).nth(0)).toHaveClass(/busy/);
    });

    test('総当たり（卓2つ）も同じカード。進行状況の欄は、重複がなく、ページが短くなる', async ({ page }) => {
      await make(page, 2, 'league');
      await expect(page.locator('#panel-league .next-list')).toHaveCount(0);
      await cards(page, 'league').nth(0).locator('[data-start]').click();
      await expect(cards(page, 'league').nth(0)).toHaveClass(/busy/);
      expect(await noOverflow(page)).toBe(true);
      if (w < 700) expect(await pageHeight(page)).toBeLessThanOrEqual(1700); // 以前（N3の後）は約2,150px
    });
  });
}

test.describe('PC幅: 卓のカードは横に並ぶ', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('卓4つで、1行に2枚以上並ぶ', async ({ page }) => {
    await make(page, 4);
    const tops = await cards(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(tops.filter((t) => t === tops[0]).length).toBeGreaterThanOrEqual(2);
  });
});

test.describe('スマホ幅: 卓のカードは縦1列', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('卓4つで、同じ左端に縦に並ぶ', async ({ page }) => {
    await make(page, 4);
    const xs = await cards(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(xs).size).toBe(1);
    const tops = await cards(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(4);
  });
});
