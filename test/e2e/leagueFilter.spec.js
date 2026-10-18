import { test, expect } from '@playwright/test';
import { open, importNames, enterScore, download } from './helpers.js';

const FOUR = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎'];

/** 4人の総当たり（6試合・3回戦・卓2つ）を作り、1試合だけ結果を入れて総当たりタブを開く */
async function prepare(page) {
  await open(page);
  await importNames(page, FOUR);
  await page.click('[data-act=gen-league]');
  await page.locator('#panel-league .next-item').first().click();
  await enterScore(page, 3, 1);
}

/** 画面に見えている試合の数（PC は表、スマホはカード） */
const visibleCount = (page) => page.locator('.results-table tbody tr, .result-cards > li').evaluateAll(
  (els) => els.filter((e) => e.getClientRects().length > 0).length,
);
const count = (page) => page.locator('#mf-count');

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test.describe(`総当たりの絞り込み（幅${w}px）`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('初期は「すべて」で、全試合と件数「6試合中 6試合を表示」が出る', async ({ page }) => {
      await prepare(page);
      await expect(page.locator('#mf-status')).toHaveValue('all');
      await expect(page.locator('#mf-round')).toHaveValue('all');
      await expect(page.locator('#mf-table')).toHaveValue('all');
      await expect(page.locator('#mf-name')).toHaveValue('');
      await expect(count(page)).toHaveText('6試合中 6試合を表示');
      expect(await visibleCount(page)).toBe(6);
      await expect(page.locator('#mf-empty')).toBeHidden();
      // 選択肢: 状態3つ、回戦は すべて＋3回戦、卓は すべて＋2卓
      expect(await page.locator('#mf-status option').allTextContents()).toEqual(['すべて', '未入力', '終了']);
      expect(await page.locator('#mf-round option').allTextContents()).toEqual(['すべて', '1回戦', '2回戦', '3回戦']);
      expect(await page.locator('#mf-table option').allTextContents()).toEqual(['すべて', '第1卓', '第2卓']);
    });

    test('状態・回戦・卓・選手名で絞り込める。組み合わせるとすべてを満たす試合だけ', async ({ page }) => {
      await prepare(page);
      await page.selectOption('#mf-status', 'pending');
      await expect(count(page)).toHaveText('6試合中 5試合を表示');
      expect(await visibleCount(page)).toBe(5);
      await page.selectOption('#mf-status', 'done');
      await expect(count(page)).toHaveText('6試合中 1試合を表示');
      expect(await visibleCount(page)).toBe(1);
      await page.selectOption('#mf-status', 'all');

      await page.selectOption('#mf-round', '2');
      await expect(count(page)).toHaveText('6試合中 2試合を表示');
      expect(await visibleCount(page)).toBe(2);
      await page.selectOption('#mf-round', 'all');

      await page.selectOption('#mf-table', { label: '第2卓' });
      const onTable2 = await visibleCount(page);
      expect(onTable2).toBeGreaterThan(0);
      expect(onTable2).toBeLessThan(6);
      await expect(count(page)).toHaveText(`6試合中 ${onTable2}試合を表示`);
      await page.selectOption('#mf-table', 'all');

      await page.fill('#mf-name', '山田');
      await expect(count(page)).toHaveText('6試合中 3試合を表示'); // 山田は3試合に出る
      await page.fill('#mf-name', '山田太郎'); // 空白を入れなくても一致する
      await expect(count(page)).toHaveText('6試合中 3試合を表示');
      await page.selectOption('#mf-status', 'pending');
      await expect(count(page)).toHaveText('6試合中 2試合を表示'); // 山田の3試合のうち、終了済み1試合を除く
      expect(await visibleCount(page)).toBe(2);
    });

    test('選手名を入力している間、欄のフォーカスは外れず、文字は消えない', async ({ page }) => {
      await prepare(page);
      await page.click('#mf-name');
      await page.keyboard.type('佐藤', { delay: 30 });
      await expect(page.locator('#mf-name')).toBeFocused();
      await expect(page.locator('#mf-name')).toHaveValue('佐藤');
      await expect(count(page)).toHaveText('6試合中 3試合を表示');
    });

    test('0件のときは「条件に合う試合はありません」と「条件を解除」が出て、解除で全試合に戻る', async ({ page }) => {
      await prepare(page);
      await page.fill('#mf-name', '該当しない名前');
      await expect(count(page)).toHaveText('6試合中 0試合を表示');
      await expect(page.locator('#mf-empty')).toBeVisible();
      await expect(page.locator('#mf-empty')).toContainText('条件に合う試合はありません');
      expect(await visibleCount(page)).toBe(0);
      await page.click('[data-filter-reset]');
      await expect(page.locator('#mf-empty')).toBeHidden();
      await expect(page.locator('#mf-name')).toHaveValue('');
      await expect(page.locator('#mf-status')).toHaveValue('all');
      await expect(count(page)).toHaveText('6試合中 6試合を表示');
      expect(await visibleCount(page)).toBe(6);
    });

    test('選んだ条件は、読み込み直しても残る。結果を保存して画面が作り直されても保つ', async ({ page }) => {
      await prepare(page);
      await page.selectOption('#mf-status', 'pending');
      await page.fill('#mf-name', '山田');
      await page.reload();
      await page.click('[data-tab=league]');
      await expect(page.locator('#mf-status')).toHaveValue('pending');
      await expect(page.locator('#mf-name')).toHaveValue('山田');
      await expect(count(page)).toHaveText('6試合中 2試合を表示');
      // 一覧の試合を押して結果を保存すると、その試合は「終了」になって一覧から消えるが、条件は残る
      const sel = w > 700 ? '.results-table tbody tr[data-match]:visible' : '.result-cards [data-match]:visible';
      await page.locator(sel).first().click();
      await enterScore(page, 2, 0);
      await expect(page.locator('#mf-status')).toHaveValue('pending');
      await expect(count(page)).toHaveText('6試合中 1試合を表示');
    });

    test('CSV と PNG と印刷は、絞り込んでいても全試合を出す', async ({ page }) => {
      await prepare(page);
      await page.selectOption('#mf-status', 'done');
      expect(await visibleCount(page)).toBe(1);
      const csv = await download(page, '#panel-league [data-export=results-csv]');
      const lines = csv.bytes.toString('utf8').trim().split('\r\n');
      expect(lines.length).toBe(7); // 見出し＋6試合
      const png = await download(page, '#panel-league [data-export=results-png]');
      expect(png.name.endsWith('.png')).toBe(true);
      // 印刷表示では、絞り込みの欄は出ず、結果一覧の表に全試合が出る（用紙の幅は700pxより広いので、幅も広げる）
      await page.setViewportSize({ width: 1100, height: 800 });
      await page.emulateMedia({ media: 'print' });
      await expect(page.locator('.match-filter')).toBeHidden();
      expect(await page.locator('.results-table tbody tr').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length)).toBe(6);
    });
  });
}

test('localStorage が使えなくても、絞り込みは動く', async ({ page }) => {
  await open(page); // 先に通常どおり開いてから、保存の読み書きを壊す
  await page.evaluate(() => {
    Storage.prototype.getItem = () => { throw new Error('使えません'); };
    Storage.prototype.setItem = () => { throw new Error('使えません'); };
  });
  await importNames(page, FOUR);
  await page.click('[data-act=gen-league]');
  await page.locator('#panel-league .next-item').first().click();
  await enterScore(page, 3, 1);
  await page.selectOption('#mf-status', 'pending');
  await expect(count(page)).toHaveText('6試合中 5試合を表示');
  await page.fill('#mf-name', '山田');
  await expect(count(page)).toHaveText('6試合中 2試合を表示');
});

test('総当たりの試合が絞り込みの対象で、トーナメントの結果一覧には絞り込みが出ない', async ({ page }) => {
  await open(page);
  await importNames(page, FOUR);
  await page.click('[data-act=gen-tournament]');
  await expect(page.locator('.match-filter')).toHaveCount(0);
});
