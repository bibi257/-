import { test, expect } from '@playwright/test';
import { NAMES, acceptDialogs, open, importNames, setNumber, enterScore } from './helpers.js';

test.describe('保存して次へ', () => {
  test('トーナメント: 結果を保存すると次の試合の入力が開く。Ctrl+Enter でも進める', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, NAMES.slice(0, 4));
    await page.click('[data-act=gen-tournament]');

    await page.locator('.next-item', { hasText: 'No.1' }).click();
    await expect(page.locator('#rd-next')).toBeVisible();
    await page.fill('#rd-s1', '3');
    await page.fill('#rd-s2', '1');
    await page.click('#rd-next');
    await expect(page.locator('#toast')).toContainText('保存しました');
    // No.2 の入力が開き、スコア欄にフォーカスがある
    await expect(page.locator('#result-dialog')).toHaveJSProperty('open', true);
    await expect(page.locator('#rd-title')).toContainText('No.2');
    await expect(page.locator('#rd-s1')).toBeFocused();

    // Ctrl+Enter で保存して次へ。No.2 を終えると決勝（No.3）が次に開く
    await page.fill('#rd-s1', '0');
    await page.fill('#rd-s2', '2');
    await page.press('#rd-s2', 'Control+Enter');
    await expect(page.locator('#rd-title')).toContainText('No.3');

    // 通常の「保存」は従来どおり閉じる
    await enterScore(page, 1, 0);
    await expect(page.locator('#result-dialog')).toHaveJSProperty('open', false);
    await expect(page.locator('.champion')).toBeVisible();
  });

  test('結果が空のままでは次へ進めず、メッセージを出す。通常の「保存」は従来どおり閉じる', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, NAMES.slice(0, 4));
    await page.click('[data-act=gen-tournament]');
    await page.locator('.next-item', { hasText: 'No.1' }).click();
    await page.click('#rd-next');
    await expect(page.locator('#rd-error')).toContainText('次の試合へ進めます');
    await expect(page.locator('#rd-title')).toContainText('No.1');
    await page.fill('#rd-s1', '2');
    await page.fill('#rd-s2', '0');
    await page.click('#rd-ok');
    await expect(page.locator('#result-dialog')).toHaveJSProperty('open', false);
  });

  test('決勝を「保存して次へ」で終えると、次が無い旨を出す', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, NAMES.slice(0, 2));
    await page.click('[data-act=gen-tournament]');
    await page.locator('.next-item', { hasText: 'No.1' }).click();
    await page.fill('#rd-s1', '2');
    await page.fill('#rd-s2', '1');
    await page.click('#rd-next');
    await expect(page.locator('#toast')).toContainText('次に行う試合はありません');
    await expect(page.locator('#result-dialog')).toHaveJSProperty('open', false);
  });

  test('総当たり: 同じ回戦の次の試合へ進み、回戦が終わると次の回戦の最初の試合へ進む', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, NAMES.slice(0, 4));
    await setNumber(page, '#table-count', 2);
    await page.click('[data-act=gen-league]');
    await page.locator('.next-item', { hasText: 'No.1' }).click();
    await page.fill('#rd-s1', '1');
    await page.fill('#rd-s2', '0');
    await page.click('#rd-next');
    await expect(page.locator('#rd-title')).toContainText('No.2');
    await page.fill('#rd-s1', '0');
    await page.fill('#rd-s2', '1');
    await page.click('#rd-next');
    // 1回戦（2試合）が終わり、2回戦の最初の試合へ
    await expect(page.locator('#rd-title')).toContainText('No.3');
    await expect(page.locator('#rd-title')).toContainText('2回戦');
  });

  test('結果を持たない（対戦者未定）試合の入力では、ボタンを出さない', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, NAMES.slice(0, 4));
    await page.click('[data-act=gen-tournament]');
    await page.locator('table.results tbody tr[data-match="R2-M1"]').click();
    await expect(page.locator('#rd-next')).toBeHidden();
  });
});

test.describe('呼び出し画面', () => {
  test('メイン画面と同じ白ベース（薄い灰の背景・白い札・紺の文字）。濃い背景は使わない', async ({ page }) => {
    await open(page);
    await importNames(page, NAMES.slice(0, 4));
    await page.click('[data-act=gen-tournament]');
    await page.click('[data-call=tournament]');
    const dlg = page.locator('#call-screen');
    await expect(dlg).toBeVisible();
    const css = (loc, prop) => loc.evaluate((el, p) => getComputedStyle(el)[p], prop);
    expect(await css(dlg, 'backgroundColor')).toBe('rgb(238, 241, 245)'); // --canvas
    expect(await css(dlg.locator('.cs-head'), 'backgroundColor')).toBe('rgb(255, 255, 255)'); // --paper
    expect(await css(dlg.locator('.cs-card').first(), 'backgroundColor')).toBe('rgb(255, 255, 255)');
    expect(await css(dlg.locator('h2'), 'color')).toBe('rgb(19, 35, 58)'); // --ink
    expect(await css(dlg.locator('.cs-players').first(), 'color')).toBe('rgb(19, 35, 58)');
    expect(await css(dlg.locator('.cs-table').first(), 'color')).toBe('rgb(29, 95, 191)'); // --primary
    // 閉じるボタンも、ほかの画面と同じ通常のボタン
    expect(await css(dlg.locator('#cs-close'), 'backgroundColor')).toBe('rgb(255, 255, 255)');
  });

  test('次に行う試合を大きく表示し、結果入力に合わせて更新される。Esc で閉じる', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, NAMES.slice(0, 4));
    await setNumber(page, '#table-count', 2);
    await page.locator('input.table-name').first().fill('Aコート');
    await page.click('[data-act=gen-tournament]');

    await page.click('[data-call=tournament]');
    const dlg = page.locator('#call-screen');
    await expect(dlg).toBeVisible();
    await expect(page.locator('#cs-progress')).toHaveText('0 / 3 試合終了');
    await expect(dlg.locator('.cs-card')).toHaveCount(2);
    await expect(dlg.locator('.cs-card').first()).toContainText('Aコート');
    await expect(dlg.locator('.cs-card').first()).toContainText('山田 太郎');
    await expect(dlg.locator('.cs-card').first()).toContainText('準決勝');

    // 閉じて結果を入れ、もう一度開くと進行が進んでいる
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await page.locator('.next-item', { hasText: 'No.1' }).click();
    await enterScore(page, 3, 0);
    await page.click('[data-call=tournament]');
    await expect(page.locator('#cs-progress')).toHaveText('1 / 3 試合終了');
    await expect(dlg.locator('.cs-card')).toHaveCount(1);
    await page.click('#cs-close');
    await expect(dlg).toBeHidden();
  });

  test('名前に HTML が入っていても、そのまま文字として表示される', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, ['<b>甲</b>', '乙']);
    await page.click('[data-act=gen-tournament]');
    await page.click('[data-call=tournament]');
    await expect(page.locator('.cs-card')).toContainText('<b>甲</b>');
    await expect(page.locator('.cs-card b')).toHaveCount(0);
  });

  test('総当たりでは休みの選手を出す。全試合が終わると終了表示になる', async ({ page }) => {
    acceptDialogs(page);
    await open(page);
    await importNames(page, NAMES.slice(0, 3));
    await page.click('[data-act=gen-league]');
    await page.click('[data-call=league]');
    await expect(page.locator('.cs-rest')).toContainText('休み');
    await page.click('#cs-close');
    for (let i = 0; i < 3; i++) {
      await page.locator('.next-item').first().click();
      await enterScore(page, 1, 0);
    }
    await page.click('[data-call=league]');
    await expect(page.locator('.cs-message')).toHaveText('全試合終了');
  });
});
