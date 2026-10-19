import { test, expect } from '@playwright/test';
import { open, importNames, enterScore, download, genTournament, openResultsFold } from './helpers.js';

const EIGHT = Array.from({ length: 8 }, (_, i) => `選手${i + 1}`);

/** 画面に見えている押せる部品のうち、高さか幅が44px未満のもの（チェックボックス・ラジオは、押せる範囲としてラベルを見る） */
async function tooSmall(page) {
  return page.evaluate(() => {
    const out = [];
    const sel = 'button, a[href], input:not([type=hidden]), select, summary, [role=button], [tabindex="0"], textarea';
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('[hidden], dialog:not([open])')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const t = el.matches('input[type=checkbox], input[type=radio]') ? el.closest('label') || el : el;
      const r = t.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 43.5 || r.height < 43.5) out.push(`${t.tagName.toLowerCase()}${t.id ? '#' + t.id : ''}.${String(t.className).trim().split(/\s+/).join('.')} ${Math.round(r.width)}x${Math.round(r.height)} ${(t.textContent || '').trim().slice(0, 12)}`);
    }
    return out;
  });
}

test.describe('幅390px: 押せる部品は高さ・幅とも44px以上', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('参加者・設定（参加者の ↑ ↓ ×、シード指名のチェック、3位決定戦など）', async ({ page }) => {
    await open(page);
    await importNames(page, EIGHT);
    await page.selectOption('#seed-mode', 'pick');
    await page.click('#editions-card > summary');
    expect(await tooSmall(page)).toEqual([]);
  });

  test('「名簿で指名する」のシード欄を出しても、ページ全体が横にはみ出さない', async ({ page }) => {
    await open(page);
    await importNames(page, EIGHT);
    await page.selectOption('#seed-mode', 'pick');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('トーナメント（回戦ごと・表で見る）・総当たり・順位表・出力メニュー', async ({ page }) => {
    await open(page);
    await importNames(page, EIGHT);
    await genTournament(page);
    expect(await tooSmall(page)).toEqual([]);
    await page.click('[data-view-mode=table]'); // 拡大縮小の －・＋ など
    expect(await tooSmall(page)).toEqual([]);
    await page.click('[data-export-toggle]');
    expect(await tooSmall(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.click('.tabs [data-tab=setup]');
    await page.click('[data-act=gen-league]');
    expect(await tooSmall(page)).toEqual([]);
    await page.click('.tabs [data-tab=standings]');
    expect(await tooSmall(page)).toEqual([]);
  });

  test('ダイアログ（結果入力・一括入力・共有）とヘッダーのメニュー', async ({ page }) => {
    await open(page);
    await importNames(page, EIGHT);
    await genTournament(page);
    await page.locator('#panel-tournament .next-item').first().click();
    expect(await tooSmall(page)).toEqual([]);
    await page.click('#rd-cancel');
    await page.click('.tabs [data-tab=setup]');
    await page.click('[data-act=import]');
    expect(await tooSmall(page)).toEqual([]);
    await page.click('#im-cancel');
    await page.click('#menu-btn');
    expect(await tooSmall(page)).toEqual([]);
    await page.click('[data-action=share]');
    expect(await tooSmall(page)).toEqual([]);
  });
});

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test.describe(`出力メニュー（幅${w}px）`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('各表の上は「出力」ボタン1つで、押すと CSV・画像（PNG）・印刷の項目が出る。data-export はそのまま', async ({ page }) => {
      await open(page);
      await importNames(page, EIGHT);
      await genTournament(page);
      const kinds = (panel) => page.locator(`${panel} .export-list [data-export]`).evaluateAll((els) => els.map((e) => e.dataset.export));
      const toggle = page.locator('#panel-tournament [data-export-toggle]');
      await expect(page.locator('#panel-tournament .toolbar [data-export-toggle]')).toHaveCount(1);
      await expect(toggle).toContainText('出力');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#panel-tournament .export-list')).toBeHidden(); // 開くまでは出ない
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(await kinds('#panel-tournament')).toEqual(['bracket-csv', 'bracket-png', 'results-csv', 'results-png', 'print']);
      expect(await page.locator('#panel-tournament .export-list button').allTextContents()).toEqual([
        'トーナメント表をCSVで保存', 'トーナメント表を画像（PNG）で保存', '試合結果をCSVで保存', '試合結果を画像（PNG）で保存', '印刷']);
      // 以前のように CSV・PNG・印刷のボタンが表の上に並んでいない
      await expect(page.locator('#panel-tournament .toolbar > :not(.export-menu)')).toHaveCount(0);

      await page.click('.tabs [data-tab=setup]');
      await page.click('[data-act=gen-league]');
      await page.click('#panel-league [data-export-toggle]');
      expect(await kinds('#panel-league')).toEqual(['matrix-csv', 'matrix-png', 'results-csv', 'results-png', 'print']);
      await page.keyboard.press('Escape');
      await page.click('.tabs [data-tab=standings]');
      await page.locator('#panel-standings [data-export-toggle]').first().click();
      expect(await page.locator('#panel-standings .export-list:visible button').allTextContents()).toEqual(['CSVで保存', '画像（PNG）で保存', '印刷']);
    });

    test('Esc・外側を押す・項目を選ぶで閉じる。Esc ではボタンへ戻る。項目を選ぶとダウンロードできる', async ({ page }) => {
      await open(page);
      await importNames(page, EIGHT);
      await genTournament(page);
      const toggle = page.locator('#panel-tournament [data-export-toggle]');
      const list = page.locator('#panel-tournament .export-list');
      await toggle.click();
      await expect(list).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(list).toBeHidden();
      await expect(toggle).toBeFocused();
      await toggle.click();
      await page.click('#panel-tournament h2');
      await expect(list).toBeHidden();
      await toggle.click();
      const csv = await download(page, '#panel-tournament [data-export=bracket-csv]');
      expect(csv.name.endsWith('.csv')).toBe(true);
      await expect(list).toBeHidden(); // 選んだら閉じる
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    test('キーボード: Enter で開いて最初の項目へ移り、↓↑で項目を移れる', async ({ page }) => {
      await open(page);
      await importNames(page, EIGHT);
      await genTournament(page);
      await page.locator('#panel-tournament [data-export-toggle]').focus();
      await page.keyboard.press('Enter');
      const items = page.locator('#panel-tournament .export-list button');
      await expect(items.nth(0)).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(items.nth(1)).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      await expect(items.nth(4)).toBeFocused(); // 先頭から戻ると、最後の項目
      await page.keyboard.press('Tab'); // メニューの外へ出ると閉じる
      await expect(page.locator('#panel-tournament .export-list')).toBeHidden();
    });
  });
}

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test.describe(`通知の位置（幅${w}px）`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('通知は画面の下に出て、固定のタブ（上）と重ならない', async ({ page }) => {
      await open(page);
      await importNames(page, EIGHT);
      await genTournament(page);
      const toast = page.locator('#toast');
      await expect(toast).toContainText('作成しました');
      const t = await toast.boundingBox();
      const tabs = await page.locator('.tabs').boundingBox();
      expect(t.y).toBeGreaterThan(h / 2); // 画面の下半分
      expect(t.y).toBeGreaterThan(tabs.y + tabs.height); // タブの下
      expect(Math.abs(t.x + t.width / 2 - w / 2)).toBeLessThan(1); // 中央
    });
  });
}

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test.describe(`総当たりで保存した試合の強調（幅${w}px）`, () => {
    test.use({ viewport: { width: w, height: h } });
    const flashing = (page) => page.locator('.matrix td.flash, .results-table tr.flash, .result-cards .rc.flash').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length);

    test('一覧から保存すると、その試合の行（カード）と総当たり表のマスが1.5秒強調される', async ({ page }) => {
      await open(page);
      await importNames(page, EIGHT);
      await page.click('[data-act=gen-league]');
      await openResultsFold(page);
      const sel = w > 700 ? '.results-table tbody tr[data-match]' : '.results-fold .result-cards [data-match]';
      await page.locator(sel).nth(3).click();
      await enterScore(page, 2, 1);
      // PC: マス2つ＋一覧の1件。スマホ: 対戦表は隠れているので、一覧の1件＋回戦ごとの表示の1件（同じ1回戦）
      expect(await flashing(page)).toBe(w > 700 ? 3 : 2);
      await page.waitForTimeout(1800);
      expect(await flashing(page)).toBe(0);
    });

    test('「次に行う試合」から保存すると、総当たり表のマスまでスクロールして強調する', async ({ page }) => {
      await open(page);
      await importNames(page, [...EIGHT, '選手9', '選手10', '選手11', '選手12']);
      await page.click('[data-act=gen-league]');
      await page.locator('#panel-league .next-item').first().click();
      await enterScore(page, 3, 0);
      expect(await flashing(page)).toBeGreaterThan(0);
      await expect.poll(() => page.locator('.matrix td.cell.flash').first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      })).toBe(true);
    });

    test('結果を取り消したときも、その試合を強調する', async ({ page }) => {
      await open(page);
      await importNames(page, EIGHT);
      await page.click('[data-act=gen-league]');
      await page.locator('#panel-league .next-item').first().click();
      await enterScore(page, 3, 0);
      await page.waitForTimeout(1800);
      page.once('dialog', (d) => d.accept());
      if (w <= 700) await page.click('[data-view-mode=table]'); // スマホの初期表示は「回戦ごと」。対戦表に切り替える
      await page.locator('.matrix td.cell.done, .matrix td.cell.win, .matrix td.cell.loss').first().click();
      await page.click('#rd-clear');
      expect(await flashing(page)).toBeGreaterThan(0);
    });
  });
}

test.describe('フォーカスの枠', () => {
  /** キーボードで操作しているときの :focus-visible の枠が、見える太さであること（枠・影・SVG の枠線のどれか） */
  async function ringVisible(page, selector) {
    await page.keyboard.press('Tab'); // キーボードで操作している状態にする
    const el = page.locator(selector).first();
    await el.focus();
    return el.evaluate((e) => {
      const cs = getComputedStyle(e);
      const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 && cs.outlineColor !== 'rgba(0, 0, 0, 0)';
      const shadow = cs.boxShadow !== 'none';
      let stroke = false;
      const hit = e.matches('g.match') ? e.querySelector('.hit') : null;
      if (hit) stroke = parseFloat(getComputedStyle(hit).strokeWidth) >= 2;
      // 薄すぎる枠は不可: outline の色が不透明に近い（白地で見える）こと
      const m = cs.outlineColor.match(/rgba?\(([^)]+)\)/);
      const alpha = m && m[1].split(',').length === 4 ? parseFloat(m[1].split(',')[3]) : 1;
      return { ok: (outline && alpha >= 0.8) || shadow || stroke, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, shadow: cs.boxShadow, stroke };
    });
  }

  test.use({ viewport: { width: 1280, height: 800 } });

  test('ボタン・タブ・入力欄・見出しの開閉・試合のマス（SVG）・次に行う試合・出力メニューで枠が見える', async ({ page }) => {
    await open(page);
    await importNames(page, EIGHT);
    for (const sel of ['.tabs [data-tab=setup]', '[data-act=import]', '#table-count', '#seed-mode', '#editions-card > summary', '.steps .step', '#menu-btn:visible, .header-actions button']) {
      const r = await ringVisible(page, sel);
      expect(r.ok, `${sel}: ${JSON.stringify(r)}`).toBe(true);
    }
    await genTournament(page);
    for (const sel of ['#panel-tournament .next-item', '#panel-tournament [data-export-toggle]', '#panel-tournament g.match', '.bracket-controls button']) {
      const r = await ringVisible(page, sel);
      expect(r.ok, `${sel}: ${JSON.stringify(r)}`).toBe(true);
    }
    await page.locator('#panel-tournament [data-export-toggle]').click();
    const r = await ringVisible(page, '#panel-tournament .export-list button');
    expect(r.ok, `export item: ${JSON.stringify(r)}`).toBe(true);
  });

  test.describe('幅390px（回戦ごとのカード）', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test('試合のカードと回戦のタブで枠が見える', async ({ page }) => {
      await open(page);
      await importNames(page, EIGHT);
      await genTournament(page);
      for (const sel of ['#round-view .rc', '#round-view [data-round-tab]', '.view-switch button']) {
        const r = await ringVisible(page, sel);
        expect(r.ok, `${sel}: ${JSON.stringify(r)}`).toBe(true);
      }
    });
  });
});
