import { test, expect } from '@playwright/test';
import { open, importNames, genTournament, enterScore } from './helpers.js';

const FOUR = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎'];
const items = ['undo', 'share', 'print', 'save', 'load', 'new'];
const item = (page, act) => page.locator(`#header-actions [data-action=${act}]:not(#share-chip)`);

test.describe('スマホのメニュー（幅390px）', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('開くと下の画面が暗くなり、暗幕を押すと閉じる。メニューには影が付く', async ({ page }) => {
    await open(page);
    await expect(page.locator('#menu-scrim')).toBeHidden();
    await page.tap('#menu-btn');
    const scrim = page.locator('#menu-scrim');
    await expect(scrim).toBeVisible();
    expect(await scrim.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(10, 20, 40, 0.4)');
    // 画面の下の方（タブより下）を押すと、暗幕が受ける
    expect(await page.evaluate(() => document.elementFromPoint(200, 700).id)).toBe('menu-scrim');
    expect(await page.locator('#header-actions').evaluate((el) => getComputedStyle(el).boxShadow)).toContain('rgba(10, 20, 40, 0.18)');
    await page.touchscreen.tap(200, 700);
    await expect(page.locator('#header-actions')).toBeHidden();
    await expect(scrim).toBeHidden();
  });

  test('3つのまとまり（元に戻す／共有・印刷・保存・読込／新しい大会を始める）の順で、まとまりの間に8pxの隙間', async ({ page }) => {
    await open(page);
    await page.tap('#menu-btn');
    const boxes = {};
    for (const act of items) boxes[act] = await item(page, act).boundingBox();
    const order = items.map((a) => boxes[a].y);
    expect(order).toEqual([...order].sort((a, b) => a - b)); // 上から、並びのとおり
    // まとまりの先頭（共有・新しい大会を始める）に、8pxの太い区切り。まとまりの中には無い
    const top = (act) => item(page, act).evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(await top('share')).toBe('8px');
    expect(await top('new')).toBe('8px');
    for (const act of ['undo', 'print', 'save', 'load']) expect(await top(act)).toBe('0px');
    for (const act of items) expect(boxes[act].height).toBeGreaterThanOrEqual(48);
  });

  test('各項目に20pxのアイコンが付く。「新規」は「新しい大会を始める」で、文字が赤', async ({ page }) => {
    await open(page);
    await page.tap('#menu-btn');
    for (const act of items) {
      const ico = item(page, act).locator('.mi-ico');
      await expect(ico).toBeVisible();
      const b = await ico.boundingBox();
      expect(Math.round(b.width)).toBe(20);
      expect(Math.round(b.height)).toBe(20);
    }
    await expect(item(page, 'new')).toHaveText('新しい大会を始める', { useInnerText: true }); // 見えている文字
    const danger = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--danger').trim());
    const color = await item(page, 'new').evaluate((el) => getComputedStyle(el).color);
    const probe = await page.evaluate((c) => { const d = document.createElement('i'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; }, danger);
    expect(color).toBe(probe);
    for (const act of ['share', 'print', 'save', 'load']) expect(await item(page, act).evaluate((el) => getComputedStyle(el).color)).not.toBe(probe);
    // data-action は変わらない（押すと今までどおり確認が出る）
    page.once('dialog', async (d) => { expect(d.message()).toBeTruthy(); await d.dismiss(); });
  });

  test('「元に戻す」は、戻せるとき、何が戻るかを名前の下に出す。戻せないときは押せない', async ({ page }) => {
    await open(page);
    await importNames(page, FOUR);
    await genTournament(page);
    await page.tap('#menu-btn');
    await expect(item(page, 'undo')).toBeEnabled(); // 表の作成が戻せる
    await expect(page.locator('#undo-sub')).toHaveText('直前：表の作成');
    await page.keyboard.press('Escape');
    await page.locator('#panel-tournament .next-item').first().click();
    await enterScore(page, 3, 1);
    await page.tap('#menu-btn');
    await expect(page.locator('#undo-sub')).toHaveText('直前：結果の保存（No.1）');
    await item(page, 'undo').tap();
    await page.tap('#menu-btn');
    await expect(page.locator('#undo-sub')).toHaveText('直前：表の作成'); // 戻すと、その前の操作になる
    await item(page, 'undo').tap();
    await page.tap('#menu-btn');
    await expect(page.locator('#undo-sub')).toHaveText('直前：参加者の変更');
    await item(page, 'undo').tap();
    await page.tap('#menu-btn');
    await expect(item(page, 'undo')).toBeDisabled();
    await expect(page.locator('#undo-sub')).toHaveText('');
  });

  test('Esc で閉じて、メニューのボタンにフォーカスが戻る。開いている間、Tab はメニューの外に出ない', async ({ page }) => {
    await open(page);
    await page.tap('#menu-btn');
    await page.keyboard.press('Escape');
    await expect(page.locator('#header-actions')).toBeHidden();
    expect(await page.evaluate(() => document.activeElement.id)).toBe('menu-btn');
    // 開いて、Tab を何度も押しても、フォーカスはメニューの中（メニューのボタンか項目）にある
    await page.tap('#menu-btn');
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement.closest('#header-actions, #menu-btn'))).toBe(true);
    }
    // Shift+Tab でも外に出ない
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => !!document.activeElement.closest('#header-actions, #menu-btn'))).toBe(true);
    }
  });
});

test.describe('PC幅（1280px）のヘッダーは今までどおり', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('文字だけのボタンが並び、アイコン・暗幕・補足は出ない。「新規」のまま。戻る操作の名前は title に出る', async ({ page }) => {
    await open(page);
    await importNames(page, FOUR);
    await genTournament(page);
    await expect(page.locator('#header-actions .mi-ico').first()).toBeHidden();
    await expect(page.locator('#undo-sub')).toBeHidden();
    await expect(page.locator('#menu-scrim')).toBeHidden();
    await expect(item(page, 'new')).toHaveText('新規', { useInnerText: true });
    expect(await item(page, 'new').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)'); // 赤ではない
    await expect(item(page, 'undo')).toHaveAttribute('title', /直前の操作「表の作成」を取り消します/);
    // ボタンは1行に横並び
    const ys = await page.locator('#header-actions > button:visible').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(ys).size).toBe(1);
  });
});
