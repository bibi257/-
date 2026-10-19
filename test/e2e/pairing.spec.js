import { test, expect } from '@playwright/test';
import { open, importNames, genTournament } from './helpers.js';

const EIGHT = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎', '田中 三郎', '伊藤 四郎', '渡辺 五郎', '中村 六子'];
const KEY = 'bukatsu-taikai:state';

const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
const dlg = (page) => page.locator('#pairing-dialog');
const players = (page) => dlg(page).locator('button.pr-p .pr-name');
const names = (page) => players(page).allTextContents();

async function setup(page, list = EIGHT) {
  await open(page);
  await importNames(page, list);
}

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test.describe(`作成前の組み合わせ確認（幅${w}px）`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('「トーナメント表を作成」で組み合わせの確認が出る。確定するまで大会データは変わらず、確定すると表ができる', async ({ page }) => {
      await setup(page);
      await page.click('[data-act=gen-tournament]');
      await expect(dlg(page)).toBeVisible();
      await expect(dlg(page).locator('li.pr-row')).toHaveCount(4);
      await expect(dlg(page).locator('li.pr-row .pr-no').first()).toHaveText('No.1');
      await expect(dlg(page).locator('li.pr-row .pr-table').first()).toHaveText('第1卓');
      expect(await names(page)).toHaveLength(8);
      expect(new Set(await names(page))).toEqual(new Set(EIGHT));
      expect((await saved(page)).tournament).toBeNull(); // 確定するまで変えない
      await page.click('#pr-ok');
      await expect(dlg(page)).not.toBeVisible();
      await expect(page.locator('#toast')).toContainText('トーナメント表を作成しました');
      expect((await saved(page)).tournament.playerIds).toHaveLength(8);
    });

    test('キャンセル・Esc では、表を作らない', async ({ page }) => {
      await setup(page);
      await page.click('[data-act=gen-tournament]');
      await page.click('#pr-cancel');
      await expect(dlg(page)).not.toBeVisible();
      expect((await saved(page)).tournament).toBeNull();
      await page.click('[data-act=gen-tournament]');
      await page.keyboard.press('Escape');
      await expect(dlg(page)).not.toBeVisible();
      expect((await saved(page)).tournament).toBeNull();
      // もう一度開くと、前回の入れ替えは残らない
      await page.click('[data-act=gen-tournament]');
      await expect(dlg(page)).toBeVisible();
      await page.click('#pr-ok');
      await expect.poll(async () => (await saved(page)).tournament?.playerIds.length).toBe(8);
    });

    test('2人を続けて押すと入れ替わる。もう一度同じ選手を押すと選択が外れる。確定すると、その配置で表ができる', async ({ page }) => {
      await setup(page);
      await page.click('[data-act=gen-tournament]');
      const before = await names(page);
      await players(page).nth(0).click();
      await expect(dlg(page).locator('button.pr-p.sel')).toHaveCount(1);
      await expect(dlg(page).locator('#pr-status')).toContainText(`「${before[0]}」を選びました`);
      await players(page).nth(0).click(); // 同じ選手で選択を外す
      await expect(dlg(page).locator('button.pr-p.sel')).toHaveCount(0);
      expect(await names(page)).toEqual(before);
      await players(page).nth(0).click();
      await players(page).nth(5).click();
      const after = await names(page);
      expect(after[0]).toBe(before[5]);
      expect(after[5]).toBe(before[0]);
      expect(after.filter((_, i) => i !== 0 && i !== 5)).toEqual(before.filter((_, i) => i !== 0 && i !== 5));
      await expect(dlg(page).locator('button.pr-p.sel')).toHaveCount(0);
      await expect(dlg(page).locator('#pr-status')).toContainText(`「${before[0]}」と「${before[5]}」を入れ替えました`);
      await page.click('#pr-ok');
      const st = await saved(page);
      const nameOf = Object.fromEntries(st.players.map((p) => [p.id, p.name]));
      expect(st.tournament.slots.map((id) => nameOf[id])).toEqual(after);
      // 表の画面にも、その配置で出る
      await expect(page.locator('#panel-tournament')).toContainText(after[0]);
    });

    test('不戦の枠がある人数（5人）: 不戦の行が出て、入れ替えても不戦の位置は変わらない', async ({ page }) => {
      await setup(page, EIGHT.slice(0, 5));
      await page.click('[data-act=gen-tournament]');
      await expect(dlg(page).locator('li.pr-bye')).toHaveCount(3);
      await expect(dlg(page).locator('li.pr-row:not(.pr-bye)')).toHaveCount(1);
      await expect(dlg(page).locator('li.pr-bye').first()).toContainText('不戦');
      const first = await saved(page);
      expect(first.tournament).toBeNull();
      // 不戦で勝ち上がる選手と、試合のある選手を入れ替える
      const rows = dlg(page).locator('li.pr-row');
      const byeBtn = rows.locator('xpath=self::*[contains(@class,"pr-bye")]').first().locator('button.pr-p');
      const matchBtn = dlg(page).locator('li.pr-row:not(.pr-bye) button.pr-p').first();
      const [bn, mn] = [await byeBtn.locator('.pr-name').textContent(), await matchBtn.locator('.pr-name').textContent()];
      await byeBtn.click();
      await matchBtn.click();
      await expect(dlg(page).locator('li.pr-bye')).toHaveCount(3);
      await expect(dlg(page).locator('li.pr-row:not(.pr-bye)')).toHaveCount(1);
      await expect(dlg(page).locator('li.pr-bye').first().locator('.pr-name')).toHaveText(mn);
      expect(bn).not.toBe(mn);
      await page.click('#pr-ok');
      const st = await saved(page);
      expect(st.tournament.slots.filter((s) => s === null)).toHaveLength(3);
    });

    test('「抽選をやり直す」は、シード・配置がランダムのときだけ出る。押しても全員が1回ずつ入っている', async ({ page }) => {
      await setup(page);
      await page.click('[data-act=gen-tournament]');
      await expect(dlg(page).locator('#pr-redraw')).toBeHidden();
      await page.click('#pr-cancel');
      await page.selectOption('#placement', 'random');
      await page.click('[data-act=gen-tournament]');
      await expect(dlg(page).locator('#pr-redraw')).toBeVisible();
      for (let i = 0; i < 3; i++) {
        await dlg(page).locator('#pr-redraw').click();
        await expect(dlg(page).locator('#pr-status')).toContainText('抽選をやり直しました');
        expect(new Set(await names(page))).toEqual(new Set(EIGHT));
      }
      // 入れ替えたあとにやり直すと、入れ替えは消える（選択も外れる）
      await players(page).nth(0).click();
      await dlg(page).locator('#pr-redraw').click();
      await expect(dlg(page).locator('button.pr-p.sel')).toHaveCount(0);
      await page.click('#pr-ok');
      expect((await saved(page)).tournament.placement).toBe('random');
    });

    test('ランダムのシード: 確認画面でシードの選手に「第Nシード」が付く', async ({ page }) => {
      await setup(page);
      await page.selectOption('#seed-mode', 'random');
      await page.fill('#seed-count', '2');
      await page.press('#seed-count', 'Tab');
      await page.click('[data-act=gen-tournament]');
      await expect(dlg(page).locator('button.pr-p .seed-badge')).toHaveCount(2);
      await expect(dlg(page).locator('button.pr-p .seed-badge').first()).toContainText('シード');
      await page.click('#pr-ok');
      expect((await saved(page)).tournament.seedCount).toBe(2);
    });

    test('欠席の人を入れたまま作るときは、確認画面で欠席の人に「欠席」と出る', async ({ page }) => {
      await setup(page);
      await page.locator('#panel-setup input.attend-box').nth(2).uncheck();
      await page.click('[data-act=gen-tournament]');
      await page.locator('#choice-dialog input[value=walkover]').check();
      await page.locator('#choice-dialog #ch-ok').click();
      await expect(dlg(page).locator('.pr-absent')).toHaveCount(1);
      await page.click('#pr-ok');
      const st = await saved(page);
      expect(Object.values(st.tournament.results)).toHaveLength(1);
    });

    test('作り直しのときも、確認が出る（結果が消える旨の確認のあと）', async ({ page }) => {
      await setup(page);
      await genTournament(page);
      await page.click('.tabs [data-tab=setup]');
      page.once('dialog', (d) => d.accept());
      await page.click('[data-act=gen-tournament]');
      await expect(dlg(page)).toBeVisible();
      await page.click('#pr-cancel');
      expect((await saved(page)).tournament.playerIds).toHaveLength(8); // 取りやめれば、今の表は残る
    });

    test('押せる大きさと、はみ出さない（選手のボタンは高さ44px以上・ダイアログが横にはみ出さない）', async ({ page }) => {
      await setup(page);
      await page.click('[data-act=gen-tournament]');
      const sizes = await dlg(page).locator('button').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().height));
      for (const s of sizes) expect(s).toBeGreaterThanOrEqual(w <= 700 ? 44 : 30);
      const over = await dlg(page).evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
      // 「この組み合わせで作成」が、画面内に見えている
      const ok = await page.locator('#pr-ok').boundingBox();
      expect(ok.y + ok.height).toBeLessThanOrEqual(h);
      expect(ok.x + ok.width).toBeLessThanOrEqual(w);
    });
  });
}
