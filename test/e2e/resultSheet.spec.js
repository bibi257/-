import { test, expect } from '@playwright/test';
import { open, importNames, genTournament } from './helpers.js';

const LONG = 'ああああああああああ';

async function openMatch(page) {
  await importNames(page, ['渡辺 五郎', '山田 太郎', '佐藤 花子', LONG]);
  await genTournament(page);
  await page.locator('.next-item').first().click();
}

test.describe('結果入力（スマホ幅のシート）', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('画面下のシートで、名前は横書き1行・ボタンは折り返さない', async ({ page }) => {
    await open(page);
    await openMatch(page);
    const box = await page.locator('#result-dialog').boundingBox();
    expect(box.x).toBe(0);
    expect(box.width).toBe(390);
    expect(Math.round(box.y + box.height)).toBe(844); // 画面の下端に付く
    expect(box.height).toBeLessThanOrEqual(844 * 0.9 + 1);

    // 名前は1行（高さが1行分）で、枠からはみ出さない
    for (const id of ['#rd-p1', '#rd-p2']) {
      const b = await page.locator(id).boundingBox();
      expect(b.height).toBeLessThan(30);
    }
    // 2人の行が縦に積まれている
    const r1 = await page.locator('.rd-row').nth(0).boundingBox();
    const r2 = await page.locator('.rd-row').nth(1).boundingBox();
    expect(r2.y).toBeGreaterThan(r1.y + r1.height - 1);
    // スコア欄は 72×48 以上、文字は 20px
    for (const id of ['#rd-s1', '#rd-s2']) {
      const b = await page.locator(id).boundingBox();
      expect(b.width).toBeGreaterThanOrEqual(72);
      expect(b.height).toBeGreaterThanOrEqual(48);
      expect(await page.locator(id).evaluate((el) => getComputedStyle(el).fontSize)).toBe('20px');
    }
    await expect(page.locator('#rd-s1')).toHaveAttribute('inputmode', 'numeric');
    // ボタンは1行に収まる
    for (const id of ['#rd-cancel', '#rd-next', '#rd-ok']) {
      const b = await page.locator(id).boundingBox();
      expect(b.height).toBeLessThan(60);
      expect(await page.locator(id).evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('nowrap');
    }
    // 「保存」は全幅
    expect((await page.locator('#rd-ok').boundingBox()).width).toBeGreaterThan(340);
  });

  test('長い名前は2行まで折り返し、「…」になるときだけ対戦の全文を出す', async ({ page }) => {
    const VERY = 'あいうえおかきくけこさしすせそたちつてと'; // 20文字
    for (const width of [375, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await open(page);
      await importNames(page, ['山田', VERY, '佐藤 花子', '鈴木']);
      await genTournament(page);
      // 20文字の選手が出る試合を開く
      const item = page.locator('.next-item', { hasText: VERY }).first();
      await item.click();
      const p1 = await page.locator('#rd-p1').boundingBox();
      const p2 = await page.locator('#rd-p2').boundingBox();
      const longBox = p1.height > p2.height ? p1 : p2;
      expect(longBox.height).toBeGreaterThan(30); // 2行になっている
      expect(longBox.height).toBeLessThan(60); // 3行にはならない
      for (const id of ['.rd-row']) {
        expect((await page.locator(id).first().boundingBox()).height).toBeGreaterThanOrEqual(48);
      }
      // 2行を超えて「…」になるときだけ、対戦の全文が出る（20文字は狭い幅では2行を超えない場合もある）
      const cut = await page.evaluate(() => ['rd-p1', 'rd-p2'].some((id) => document.getElementById(id).scrollHeight > document.getElementById(id).clientHeight + 1));
      const versus = page.locator('#rd-versus');
      if (cut) await expect(versus).toContainText(`対戦：`);
      else await expect(versus).toBeHidden();
      await page.keyboard.press('Escape');
    }
  });

  test('とても長い名前では「…」の代わりに対戦の全文が見出しの下に出る', async ({ page }) => {
    const HUGE = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよ'; // 36文字
    await open(page);
    await importNames(page, ['山田', HUGE, '佐藤', '鈴木']);
    await genTournament(page);
    await page.locator('.next-item', { hasText: HUGE }).first().click();
    const versus = page.locator('#rd-versus');
    await expect(versus).toBeVisible();
    await expect(versus).toContainText(HUGE);
    await expect(versus).toContainText('対戦：');
    // 2文字・短い名前の試合では出ない
    await page.keyboard.press('Escape');
    await page.locator('.next-item').filter({ hasNotText: HUGE }).first().click();
    await expect(versus).toBeHidden();
  });

  test('シートを開いたまま画面の幅が変わると、対戦の全文の表示も追従する', async ({ page }) => {
    const HUGE = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよ';
    await open(page);
    await importNames(page, ['山田', HUGE, '佐藤', '鈴木']);
    await genTournament(page);
    await page.locator('.next-item', { hasText: HUGE }).first().click();
    const versus = page.locator('#rd-versus');
    await expect(versus).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 }); // PC幅では名前を省略しない
    await expect(versus).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(versus).toBeVisible();
  });

  test('画面が低いときは中身だけスクロールし、ボタンは下に固定される', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 480 });
    await open(page);
    await openMatch(page);
    const body = page.locator('#result-form .rd-body');
    expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    for (const id of ['#rd-ok', '#rd-cancel']) {
      const b = await page.locator(id).boundingBox();
      expect(b.y + b.height).toBeLessThanOrEqual(480);
    }
    const sheet = await page.locator('#result-dialog').boundingBox();
    expect(sheet.height).toBeLessThanOrEqual(480 * 0.9 + 1);
  });

  test('行のどこをタップしても勝者になり「勝者」バッジが出る', async ({ page }) => {
    await open(page);
    await openMatch(page);
    await expect(page.locator('.rd-badge:visible')).toHaveCount(0);
    // 名前より右の空き（バッジ・スコア欄の間）をタップ
    const row2 = await page.locator('.rd-row').nth(1).boundingBox();
    await page.touchscreen.tap(row2.x + row2.width - 90, row2.y + 4);
    await expect(page.locator('input[name=outcome][value=p2]')).toBeChecked();
    await expect(page.locator('.rd-badge:visible')).toHaveCount(1);
    await expect(page.locator('.rd-row').nth(1).locator('.rd-badge')).toBeVisible();
    // もう一方の行に切り替わる
    const row1 = await page.locator('.rd-row').nth(0).boundingBox();
    await page.touchscreen.tap(row1.x + 110, row1.y + row1.height / 2); // 名前の上
    await expect(page.locator('input[name=outcome][value=p1]')).toBeChecked();
    await expect(page.locator('.rd-row').nth(0).locator('.rd-badge')).toBeVisible();
    await expect(page.locator('.rd-row').nth(1).locator('.rd-badge')).toBeHidden();
    // スコア欄のタップはそのまま入力できる（勝者の選択に奪われない）
    await page.locator('#rd-s2').tap();
    await expect(page.locator('#rd-s2')).toBeFocused();
    await page.keyboard.type('5');
    await page.fill('#rd-s1', '2');
    await page.click('#rd-ok');
    await expect(page.locator('#toast')).toContainText('保存しました');
  });

  test('保存済みの試合には「結果を取り消す」が文字だけのボタンで最下部に出る', async ({ page }) => {
    await open(page);
    await openMatch(page);
    await page.fill('#rd-s1', '3');
    await page.fill('#rd-s2', '1');
    await page.click('#rd-ok');
    await page.locator('#round-view .rc.st-done').first().click(); // スマホ幅は「回戦ごと」のカード
    await expect(page.locator('#rd-clear')).toBeVisible();
    const ok = await page.locator('#rd-ok').boundingBox();
    const clear = await page.locator('#rd-clear').boundingBox();
    expect(clear.y).toBeGreaterThan(ok.y + ok.height - 1);
    expect(await page.locator('#rd-clear').evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px');
    expect(clear.height).toBeLessThan(60);
  });

  test('不戦勝・引き分け・卓の選択は1行ずつ並ぶ', async ({ page }) => {
    await open(page);
    await importNames(page, ['A', 'B', 'C']);
    await page.click('[data-act=gen-league]');
    await page.locator('.next-item').first().click();
    const ys = [];
    for (const sel of ['#rd-draw-wrap', '#rd-walkover', '#rd-table']) {
      ys.push((await page.locator(sel).boundingBox()).y);
    }
    expect(ys[1]).toBeGreaterThan(ys[0] + 20);
    expect(ys[2]).toBeGreaterThan(ys[1] + 20);
  });
});

test.describe('結果入力（PC幅は従来どおり）', () => {
  test('1280px では中央のダイアログで、横1列に並ぶ', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    await openMatch(page);
    const box = await page.locator('#result-dialog').boundingBox();
    expect(box.width).toBeLessThan(600);
    expect(box.y).toBeGreaterThan(50);
    const p1 = await page.locator('.rd-row').nth(0).locator('.rd-player').boundingBox();
    const s1 = await page.locator('#rd-s1').boundingBox();
    const s2 = await page.locator('#rd-s2').boundingBox();
    expect(Math.abs(s1.y - s2.y)).toBeLessThan(2); // 2つのスコア欄が同じ高さ
    expect(s1.x).toBeGreaterThan(p1.x + p1.width - 1);
    await expect(page.locator('.rd-badge:visible')).toHaveCount(0);
  });
});
