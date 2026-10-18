import { test, expect } from '@playwright/test';
import { open, importNames, enterScore, acceptDialogs } from './helpers.js';

const EIGHT = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎', '田中 三郎', '伊藤 四郎', '渡辺 五郎', '中村 六子'];

async function startTournament(page, names = EIGHT) {
  await open(page);
  await importNames(page, names);
  await page.click('[data-act=gen-tournament]');
}
const turnOn = (page) => page.click('[data-my-toggle=on]');
const choose = (page, name) => page.fill('#my-name', name);
/** 画面で、選んだ選手として強調されている要素の数 */
const mineCount = (page) => page.locator('.mine').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length);

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test.describe(`自分の試合（幅${w}px）`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('運営の画面は、最初はオフ。「自分の試合を探す」を押すとオンになる', async ({ page }) => {
      await startTournament(page);
      await expect(page.locator('#my-panel')).toBeVisible();
      await expect(page.locator('#my-panel [data-my-toggle=on]')).toBeVisible();
      await expect(page.locator('#my-name')).toHaveCount(0);
      expect(await mineCount(page)).toBe(0);
      await turnOn(page);
      await expect(page.locator('#my-name')).toBeVisible();
      await expect(page.locator('#my-panel [data-my-toggle=off]')).toBeVisible();
      await expect(page.locator('#my-panel .my-hint')).toContainText('名前を入力して選ぶ');
    });

    test('名前を選ぶと「あなたの次の試合」に、卓・時間帯・対戦相手・試合番号が出る', async ({ page }) => {
      await startTournament(page);
      await turnOn(page);
      await choose(page, '山田 太郎');
      const card = page.locator('#my-cards .my-card');
      await expect(card).toHaveCount(1);
      await expect(card.locator('h3')).toHaveText('あなたの次の試合');
      await expect(card).toContainText('第1卓');
      await expect(card).toContainText('No.1');
      await expect(card).toContainText('準々決勝');
      await expect(card.locator('.my-opp b')).toHaveText('中村 六子'); // 1番と8番の組
    });

    test('一部だけの文字では選ばれない。空にすると選択が外れる。解除ボタンも使える', async ({ page }) => {
      await startTournament(page);
      await turnOn(page);
      await choose(page, '山田');
      await expect(page.locator('#my-cards .my-card')).toHaveCount(0);
      await choose(page, '山田太郎'); // 空白なしでも選べる
      await expect(page.locator('#my-cards .my-card')).toHaveCount(1);
      await choose(page, '');
      await expect(page.locator('#my-cards .my-card')).toHaveCount(0);
      await choose(page, '佐藤 花子');
      await expect(page.locator('#my-cards .my-card')).toHaveCount(1);
      await page.click('[data-my-clear]');
      await expect(page.locator('#my-cards .my-card')).toHaveCount(0);
      await expect(page.locator('#my-name')).toHaveValue('');
      expect(await mineCount(page)).toBe(0);
    });

    test('表・一覧・カードの、その選手の名前だけが太字＋背景色で強調される', async ({ page }) => {
      await startTournament(page);
      await turnOn(page);
      await choose(page, '山田 太郎');
      expect(await mineCount(page)).toBeGreaterThan(2);
      // 強調されているのは、山田さんの名前だけ
      const others = await page.locator('.mine').evaluateAll((els) => els.filter((e) => !(e.textContent || '').includes('山田 太郎') && e.tagName !== 'TR' && e.tagName !== 'rect').length); // 枠の rect は文字を持たない
      expect(others).toBe(0);
      const root = await page.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--mine-bg)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
      const sel = w > 700 ? '.results-table td[data-pid].mine' : '.result-cards .rc-p.mine';
      const el = page.locator(sel).first();
      expect(await el.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(root);
      expect(Number(await el.evaluate((e) => getComputedStyle(e).fontWeight))).toBeGreaterThanOrEqual(600);
      // トーナメント表（SVG）にも出る（PC は表で見る、スマホは「表で見る」へ切り替える）
      if (w <= 700) await page.click('[data-view-mode=table]');
      await expect(page.locator('#bracket-wrap svg rect[data-pid].mine').first()).toBeAttached();
      expect(await page.locator('#bracket-wrap svg text[data-pid].mine').first().evaluate((e) => getComputedStyle(e).fontWeight)).toMatch(/bold|700/);
    });

    test('結果が入ると、次の試合が変わる（対戦者が未定なら「未定です」）', async ({ page }) => {
      await startTournament(page);
      await turnOn(page);
      await choose(page, '山田 太郎');
      await page.locator('#panel-tournament .next-item').first().click(); // No.1 山田 対 中村
      await enterScore(page, 2, 1);
      const card = page.locator('#my-cards .my-card');
      await expect(card).toContainText('次の試合は未定です'); // 準決勝の相手が、隣の試合の結果待ち
      await expect(card).toContainText('準決勝');
      await page.locator('#panel-tournament .next-item').first().click(); // No.2
      await enterScore(page, 2, 1);
      await expect(card).toContainText('No.5'); // 準決勝（試合番号5）が次になる
      await expect(card.locator('.my-opp b')).not.toHaveText('');
    });

    test('負けると、成績と敗退した回戦が出る。選んだ名前は、再読み込みしても残る', async ({ page }) => {
      await startTournament(page);
      await turnOn(page);
      await choose(page, '中村 六子');
      await page.locator('#panel-tournament .next-item').first().click();
      await enterScore(page, 2, 1); // 山田の勝ち、中村の負け
      await expect(page.locator('#my-cards .my-card')).toContainText('全試合が終わりました');
      await expect(page.locator('#my-cards .my-card')).toContainText('0勝1敗');
      await expect(page.locator('#my-cards .my-card')).toContainText('準々決勝敗退');
      await page.reload();
      await expect(page.locator('#my-name')).toHaveValue('中村 六子');
      await expect(page.locator('#my-cards .my-card')).toContainText('準々決勝敗退');
      expect(await mineCount(page)).toBeGreaterThan(0);
    });

    test('トーナメントと総当たりの両方にいるときは、カードが2枚出る。総当たりの次の試合も出る', async ({ page }) => {
      await startTournament(page);
      await page.click('.tabs [data-tab=setup]');
      await page.click('[data-act=gen-league]');
      await turnOn(page);
      await choose(page, '佐藤 花子');
      const titles = await page.locator('#my-cards .my-card h3').allTextContents();
      expect(titles).toEqual(['あなたの次の試合（トーナメント）', 'あなたの次の試合（総当たり）']);
      await expect(page.locator('#my-cards .my-card').nth(1)).toContainText('1回戦');
    });

    test('印刷では、名前の入力欄は出ないが、表の中の強調は残る', async ({ page }) => {
      await startTournament(page);
      await turnOn(page);
      await choose(page, '山田 太郎');
      await page.setViewportSize({ width: 1100, height: 800 });
      await page.emulateMedia({ media: 'print' });
      await expect(page.locator('#my-panel')).toBeHidden();
      expect(await mineCount(page)).toBeGreaterThan(0);
    });
  });
}

test('localStorage が使えなくても動く', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    Storage.prototype.getItem = () => { throw new Error('使えません'); };
    Storage.prototype.setItem = () => { throw new Error('使えません'); };
  });
  await importNames(page, EIGHT);
  await page.click('[data-act=gen-tournament]');
  await turnOn(page);
  await choose(page, '山田 太郎');
  await expect(page.locator('#my-cards .my-card')).toHaveCount(1);
  expect(await mineCount(page)).toBeGreaterThan(0);
});

test('名簿から消えた選手の選択は、名前が同じ人に引き継ぐか、外れる', async ({ page }) => {
  acceptDialogs(page);
  await startTournament(page);
  await turnOn(page);
  await choose(page, '田中 三郎');
  await expect(page.locator('#my-cards .my-card')).toHaveCount(1);
  await page.click('.tabs [data-tab=setup]');
  await page.locator('[data-act=del][data-i="4"]').click(); // 田中を削除
  await page.click('.tabs [data-tab=tournament]');
  await expect(page.locator('#my-name')).toHaveValue('');
  await expect(page.locator('#my-cards .my-card')).toHaveCount(0);
});
