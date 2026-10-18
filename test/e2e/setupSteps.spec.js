import { test, expect } from '@playwright/test';
import { open, importNames } from './helpers.js';

const NAMES = Array.from({ length: 12 }, (_, i) => `選手${i + 1}`);
const done = (page, n) => page.locator(`.steps li:nth-child(${n}) .step`);

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test.describe(`参加者・設定の流れ（幅${w}px）`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('3段階が最上部に並び、参加者2人でチェック、作成済みで3にチェックが付く', async ({ page }) => {
      await open(page);
      const steps = page.locator('.steps .step');
      await expect(steps).toHaveCount(3);
      await expect(steps.nth(0)).toContainText('大会情報と参加者');
      await expect(steps.nth(1)).toContainText('卓と形式');
      await expect(steps.nth(2)).toContainText('表を作成');
      for (const n of [1, 2, 3]) await expect(done(page, n)).not.toHaveClass(/done/);
      // 最上部（大会情報のカードより上）にある
      const sb = await page.locator('.steps').boundingBox();
      const ib = await page.locator('#setup-info').boundingBox();
      expect(sb.y).toBeLessThan(ib.y);

      await page.fill('#new-player', 'A'); await page.press('#new-player', 'Enter');
      await expect(done(page, 1)).not.toHaveClass(/done/); // 1人ではまだ
      await page.fill('#new-player', 'B'); await page.press('#new-player', 'Enter');
      await expect(done(page, 1)).toHaveClass(/done/);
      await expect(done(page, 3)).not.toHaveClass(/done/);
      await expect(done(page, 1)).toHaveAttribute('aria-label', /済み/);

      await page.click('[data-act=gen-tournament]');
      await page.click('.tabs [data-tab=setup]');
      await expect(done(page, 3)).toHaveClass(/done/);
      await expect(done(page, 2)).not.toHaveClass(/done/); // 2 には確認する項目がない
    });

    test('段階を押すと、その位置へスクロールする', async ({ page }) => {
      await open(page);
      await importNames(page, NAMES);
      await page.locator('.steps .step').nth(1).click();
      await expect.poll(() => page.locator('#setup-tables').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeLessThan(200);
      await page.locator('.steps .step').nth(2).click();
      await expect.poll(() => page.locator('#setup-create').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      })).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('.steps .step').nth(0).click();
      await expect.poll(() => page.locator('#setup-info').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeLessThan(200);
    });

    test('カードの順番は 大会情報→参加者→卓→トーナメント→総当たり→大会の回数', async ({ page }) => {
      await open(page);
      const ids = await page.locator('#panel-setup .card').evaluateAll((els) => els.map((e) => e.id));
      const order = ['setup-info', 'setup-players', 'setup-tables', 'setup-tournament', 'setup-league', 'editions-card'];
      expect(ids).toEqual(expect.arrayContaining(order));
      const ys = await Promise.all(order.map((id) => page.locator(`#${id}`).evaluate((el) => el.getBoundingClientRect().top + scrollY)));
      if (w < 900) {
        expect([...ys].sort((a, b) => a - b)).toEqual(ys); // 1列で、上から順
      } else {
        // PC は左列（大会情報・参加者）と右列（卓・トーナメント・総当たり）の2列
        const xs = await Promise.all(order.map((id) => page.locator(`#${id}`).evaluate((el) => el.getBoundingClientRect().left)));
        expect(xs[0]).toBe(xs[1]);
        expect(xs[2]).toBe(xs[3]);
        expect(xs[3]).toBe(xs[4]);
        expect(xs[2]).toBeGreaterThan(xs[0] + 100);
        expect(ys[1]).toBeGreaterThan(ys[0]);
        expect(ys[3]).toBeGreaterThan(ys[2]);
        expect(ys[5]).toBeGreaterThan(Math.max(ys[1], ys[4]));
      }
    });

    test('作成ボタンは各カードの下で全幅。作成済みは「作り直す」と、結果が消える旨が1行出る', async ({ page }) => {
      await open(page);
      await importNames(page, NAMES);
      for (const [act, card] of [['gen-tournament', 'setup-tournament'], ['gen-league', 'setup-league']]) {
        const bb = await page.locator(`[data-act=${act}]`).boundingBox();
        const cb = await page.locator(`#${card}`).boundingBox();
        expect(bb.width).toBeGreaterThan(cb.width - 50);
        expect(bb.y + bb.height).toBeGreaterThan(cb.y + cb.height - 30); // カードの下
        await expect(page.locator(`#${card} .create-note`)).toHaveCount(0);
      }
      await page.click('[data-act=gen-tournament]');
      await page.click('.tabs [data-tab=setup]');
      await expect(page.locator('[data-act=gen-tournament]')).toHaveText('トーナメント表を作り直す');
      await expect(page.locator('#setup-tournament .create-note')).toContainText('結果はすべて消えます');
      await expect(page.locator('[data-act=gen-league]')).toHaveText('総当たり表を作成');
    });

    test('「大会の回数」は過去の大会が0件のとき折りたたまれ、開け閉めを覚える', async ({ page }) => {
      await open(page);
      const card = page.locator('#editions-card');
      expect(await card.evaluate((el) => el.tagName)).toBe('DETAILS');
      await expect(card.locator('summary')).toContainText('大会の回数');
      await expect(card.locator('[data-edition=next]')).toBeHidden();
      await card.locator('summary').click();
      await expect(card.locator('[data-edition=next]')).toBeVisible();
      await page.fill('#new-player', 'A'); await page.press('#new-player', 'Enter'); // 画面を作り直しても開いたまま
      await expect(page.locator('#editions-card [data-edition=next]')).toBeVisible();
      // 閉じた直後（toggle イベントが届く前）に画面が作り直されても、閉じたまま・開いたままを保つ
      await page.evaluate(() => {
        document.querySelector('#editions-card > summary').click(); // 閉じる
        document.getElementById('new-player').value = 'B';
        document.getElementById('add-player-form').requestSubmit();
      });
      await expect(page.locator('#editions-card')).not.toHaveAttribute('open', '');
      await page.evaluate(() => {
        document.querySelector('#editions-card > summary').click(); // 開く
        document.getElementById('new-player').value = 'C';
        document.getElementById('add-player-form').requestSubmit();
      });
      await expect(page.locator('#editions-card [data-edition=next]')).toBeVisible();
    });
  });
}

test.describe('幅390pxの崩れ', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('開催日時の日付と時刻は2列で横に並ぶ', async ({ page }) => {
    await open(page);
    const d = await page.locator('#meta-date').boundingBox();
    const t = await page.locator('#meta-time').boundingBox();
    expect(Math.abs(d.y - t.y)).toBeLessThan(2);
    expect(t.x).toBeGreaterThan(d.x + d.width - 1);
    expect(t.x + t.width).toBeLessThanOrEqual(390);
  });

  test('勝点の 勝・分・敗 は3列で1行に収まる', async ({ page }) => {
    await open(page);
    const bs = await Promise.all(['#pt-win', '#pt-draw', '#pt-loss'].map((id) => page.locator(id).boundingBox()));
    expect(Math.abs(bs[0].y - bs[1].y)).toBeLessThan(2);
    expect(Math.abs(bs[1].y - bs[2].y)).toBeLessThan(2);
    expect(bs[2].x + bs[2].width).toBeLessThanOrEqual(390);
  });

  test('参加者の「一括入力・CSV取込」「全員削除」は見出しの下の1行に並ぶ', async ({ page }) => {
    await open(page);
    const h2 = await page.locator('#setup-players h2').boundingBox();
    const a = await page.locator('[data-act=import]').boundingBox();
    const b = await page.locator('[data-act=clear-players]').boundingBox();
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(a.y).toBeGreaterThan(h2.y + 15); // 見出しの文字より下の段
    expect(b.x + b.width).toBeLessThanOrEqual(390);
  });

  test('参加者0人の「まだ参加者がいません」が1列に潰れず、表の全幅に出る', async ({ page }) => {
    await open(page);
    const td = page.locator('#setup-players tbody td.muted');
    expect(await td.getAttribute('colspan')).toBe('4'); // No・出席・名前・並べ替え削除の4列（出席の列を足したため3から変更）
  });

  test('横スクロールが出ない', async ({ page }) => {
    await open(page);
    await importNames(page, NAMES);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
