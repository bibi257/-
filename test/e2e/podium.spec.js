import { test, expect } from '@playwright/test';
import { open, importNames, enterScore, acceptDialogs } from './helpers.js';

const NAMES = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎'];

/** 次に行う試合を、1人目の勝ちで最後まで進める */
async function finishAll(page) {
  for (let i = 0; i < 12; i++) {
    const next = page.locator('#panel-tournament .next-item').first();
    if (!(await next.count())) return;
    await next.click();
    await enterScore(page, 2, 1);
  }
}

async function start(page, names, { third = false } = {}) {
  await open(page);
  await importNames(page, names);
  if (third) await page.check('#third-place');
  await page.click('[data-act=gen-tournament]');
}

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test.describe(`表彰のカード（幅${w}px）`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('決勝が終わるまでは出ない。終わると、トーナメントタブの最上部に 優勝・準優勝・3位（2人）が出る', async ({ page }) => {
      await start(page, NAMES);
      await expect(page.locator('.podium')).toHaveCount(0);
      // 準決勝を終えて決勝だけが残った状態でも、まだ出ない
      for (let i = 0; i < 2; i++) { await page.locator('#panel-tournament .next-item').first().click(); await enterScore(page, 2, 1); }
      await expect(page.locator('.podium')).toHaveCount(0);
      await finishAll(page);
      const podium = page.locator('#panel-tournament .podium');
      await expect(podium).toBeVisible();
      // 最上部: パネルの最初の要素で、進行状況のカードより上
      expect(await page.locator('#panel-tournament > :first-child').evaluate((el) => el.classList.contains('podium'))).toBe(true);
      const pb = await podium.boundingBox();
      const prog = await page.locator('#panel-tournament .progress').boundingBox();
      expect(pb.y).toBeLessThan(prog.y);
      await expect(podium.locator('.podium-row.gold')).toContainText('優勝');
      await expect(podium.locator('.podium-row.gold .podium-name')).toHaveText('山田 太郎');
      await expect(podium.locator('.podium-row.silver')).toContainText('準優勝');
      await expect(podium.locator('.podium-row.silver .podium-name')).toHaveText('佐藤 花子');
      await expect(podium.locator('.podium-row.bronze')).toContainText('3位');
      // 3位決定戦がないので、準決勝で敗れた2人がどちらも3位
      expect(await podium.locator('.podium-row.bronze .podium-name').allTextContents()).toEqual(['鈴木 一郎', '高橋 次郎']);
    });

    test('金・銀・銅の色の帯と、優勝の大きな文字（28px）。動きは付けない', async ({ page }) => {
      await start(page, NAMES);
      await finishAll(page);
      const style = (sel, prop) => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el)[p], prop);
      const root = (name) => page.evaluate((n) => { const d = document.createElement('i'); d.style.color = `var(${n})`; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }, name);
      for (const [cls, token] of [['gold', '--medal-gold'], ['silver', '--medal-silver'], ['bronze', '--medal-bronze']]) {
        expect(await style(`.podium-row.${cls}`, 'borderLeftColor')).toBe(await root(token));
        expect(await style(`.podium-row.${cls}`, 'borderLeftWidth')).toBe('8px');
      }
      expect(await style('.podium-row.gold .podium-name', 'fontSize')).toBe('28px');
      expect(parseFloat(await style('.podium-row.silver .podium-name', 'fontSize'))).toBeLessThan(28);
      expect(await style('.podium', 'animationName')).toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test('3位決定戦があるときは、その試合が終わってから出て、3位はその勝者1人', async ({ page }) => {
      await start(page, NAMES, { third: true });
      for (let i = 0; i < 3; i++) { await page.locator('#panel-tournament .next-item').first().click(); await enterScore(page, 2, 1); }
      await expect(page.locator('.podium')).toHaveCount(0); // 決勝まで終わっても、3位決定戦が残っている
      await finishAll(page);
      await expect(page.locator('.podium')).toBeVisible();
      expect(await page.locator('.podium-row.bronze .podium-name').allTextContents()).toEqual(['高橋 次郎']); // 3位決定戦（高橋 対 鈴木）は1人目の高橋の勝ち
    });

    test('2人の大会は、3位の行がない。結果を取り消すと、表彰は消える', async ({ page }) => {
      acceptDialogs(page);
      await start(page, ['山田 太郎', '佐藤 花子']);
      await finishAll(page);
      await expect(page.locator('.podium-row.gold .podium-name')).toHaveText('山田 太郎');
      await expect(page.locator('.podium-row.silver .podium-name')).toHaveText('佐藤 花子');
      await expect(page.locator('.podium-row.bronze')).toHaveCount(0);
      // 決勝の結果を取り消す
      await page.locator(w > 700 ? '#panel-tournament g.match' : '#round-view .rc').first().click();
      await page.click('#rd-clear');
      await expect(page.locator('.podium')).toHaveCount(0);
    });

    test('呼び出し画面の優勝表示に、準優勝と3位も出る', async ({ page }) => {
      await start(page, NAMES);
      await finishAll(page);
      await page.click('[data-call=tournament]');
      await expect(page.locator('.cs-champion')).toContainText('山田 太郎');
      const sub = page.locator('.cs-podium');
      await expect(sub).toContainText('準優勝');
      await expect(sub).toContainText('佐藤 花子');
      await expect(sub).toContainText('3位');
      await expect(sub).toContainText('鈴木 一郎');
      await expect(sub).toContainText('高橋 次郎');
    });
  });
}

test('トーナメント表（画面のSVG・PNG出力と同じ）の右上に、優勝者名が小さく入る', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page, NAMES);
  // 見出し「優勝」の列とは別に、右上の「優勝　名前」の文字（全角空白つき）が入る
  const topRight = () => page.locator('#bracket-wrap svg text').evaluateAll((els) => els.map((e) => e.textContent).filter((t) => t.startsWith('優勝　')));
  expect(await topRight()).toEqual([]);
  await finishAll(page);
  expect(await topRight()).toEqual(['優勝　山田 太郎']);
});

test('印刷でも表彰は出る', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await start(page, NAMES);
  await finishAll(page);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.podium')).toBeVisible();
});
