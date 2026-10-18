import { test, expect } from '@playwright/test';
import { open, importNames, enterScore, acceptDialogs } from './helpers.js';

const EIGHT = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎', '田中 三郎', '伊藤 四郎', '渡辺 五郎', '中村 六子'];

async function startTournament(page, names = EIGHT) {
  await open(page);
  await importNames(page, names);
  await page.click('[data-act=gen-tournament]');
}
const card = (page, no) => page.locator('#panel-tournament .ni-card', { hasText: `No.${no}` }).first();
const board = (page) => page.locator('#panel-tournament .table-board');

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test.describe(`試合の開始と卓の空き状況（幅${w}px）`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('「次に行う試合」に「開始」ボタンが付き、押すと進行中になる（緑の枠・バッジ・経過時間）。取り消せる', async ({ page }) => {
      await startTournament(page);
      const c = card(page, 1);
      await expect(c.locator('[data-start]')).toHaveText('開始');
      await expect(c).not.toHaveClass(/running/);
      await c.locator('[data-start]').click();
      await expect(c).toHaveClass(/running/);
      await expect(c.locator('.badge-running')).toHaveText('進行中');
      await expect(c.locator('.ni-elapsed')).toHaveText('0分');
      await expect(c.locator('[data-unstart]')).toHaveText('開始を取り消す');
      await expect(c.locator('[data-start]')).toHaveCount(0);
      // 他の試合は開始していない
      await expect(card(page, 2)).not.toHaveClass(/running/);
      await c.locator('[data-unstart]').click();
      await expect(c).not.toHaveClass(/running/);
      await expect(c.locator('.badge-running')).toHaveCount(0);
      await expect(c.locator('[data-start]')).toBeVisible();
    });

    test('卓の一覧: 空きの卓には、その卓の次の試合を「次」に出す。開始すると「進行中：No. 対戦者（分）」になる', async ({ page }) => {
      await startTournament(page);
      await expect(board(page).locator('.tb')).toHaveCount(2);
      await expect(board(page).locator('.tb').nth(0)).toContainText('空き');
      await expect(board(page).locator('.tb').nth(0)).toContainText('次：No.1 山田 太郎 vs 中村 六子');
      await expect(board(page).locator('.tb').nth(1)).toContainText('次：No.2');
      await card(page, 1).locator('[data-start]').click();
      const t1 = board(page).locator('.tb').nth(0);
      await expect(t1).toHaveClass(/busy/);
      await expect(t1).toContainText('第1卓');
      await expect(t1.locator('.badge-running')).toHaveText('進行中');
      await expect(t1).toContainText('No.1 山田 太郎 vs 中村 六子（0分）');
      await expect(t1).not.toContainText('次：');
      await expect(board(page).locator('.tb').nth(1)).toContainText('空き'); // 第2卓は空いたまま
    });

    test('結果を保存すると、進行中は終わり、卓は空きに戻って、その卓の次の試合が出る', async ({ page }) => {
      await startTournament(page);
      await card(page, 1).locator('[data-start]').click();
      await card(page, 1).locator('.next-item').click();
      await enterScore(page, 2, 1);
      await expect(page.locator('#panel-tournament .ni-card', { hasText: 'No.1 ' })).toHaveCount(0); // 終わった試合は次の一覧から消える
      const t1 = board(page).locator('.tb').nth(0);
      await expect(t1).toHaveClass(/free/);
      await expect(t1).toContainText('空き');
      await expect(page.locator('#panel-tournament .badge-running')).toHaveCount(0);
    });

    test('試合結果一覧の状態も「進行中」になる（表とカード）', async ({ page }) => {
      await startTournament(page);
      await card(page, 1).locator('[data-start]').click();
      const sel = w > 700 ? '.results-table tr[data-match="R1-M1"] .badge' : '.result-cards [data-match="R1-M1"] .badge';
      await expect(page.locator(`#panel-tournament ${sel}`).first()).toHaveText('進行中');
      await expect(page.locator(`#panel-tournament ${sel.replace('R1-M1', 'R1-M2')}`).first()).toHaveText('試合待ち');
    });

    test('同じ卓で別の試合が進行中のときは、開始の前に確認する。キャンセルなら開始しない', async ({ page }) => {
      const dialogs = [];
      page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
      await startTournament(page);
      await card(page, 1).locator('[data-start]').click();
      // 1回戦の3番目の試合も第1卓に割り当たる（卓は2つ）
      const same = page.locator('#panel-tournament .ni-card', { hasText: '第1卓' }).filter({ hasNotText: 'No.1 ' }).first();
      await same.locator('[data-start]').click();
      expect(dialogs.some((m) => m.includes('第1卓では') && m.includes('No.1') && m.includes('進行中'))).toBe(true);
      await expect(same).not.toHaveClass(/running/);
      page.removeAllListeners('dialog');
      page.on('dialog', (d) => d.accept());
      await same.locator('[data-start]').click();
      await expect(same).toHaveClass(/running/);
    });

    test('経過時間（分）は、画面を描き直さなくても進む', async ({ page }) => {
      await page.clock.install({ time: new Date('2026-10-18T05:00:00Z') });
      await startTournament(page);
      await card(page, 1).locator('[data-start]').click();
      await expect(card(page, 1).locator('.ni-elapsed')).toHaveText('0分');
      await page.clock.runFor(12 * 60 * 1000 + 30 * 1000);
      await expect(card(page, 1).locator('.ni-elapsed')).toHaveText('12分');
      await expect(board(page).locator('.tb').nth(0)).toContainText('（12分）');
    });

    test('開始は、保存・再読み込みしても残る', async ({ page }) => {
      await startTournament(page);
      await card(page, 2).locator('[data-start]').click();
      await page.reload();
      await page.click('.tabs [data-tab=tournament]');
      await expect(card(page, 2)).toHaveClass(/running/);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bukatsu-taikai:state')).tournament.started);
      expect(Object.keys(saved)).toEqual(['R1-M2']);
      expect(saved['R1-M2'].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('呼び出し画面: 「進行中」と「次に行う試合」を分けて出す', async ({ page }) => {
      await startTournament(page);
      await card(page, 1).locator('[data-start]').click();
      await page.click('[data-call=tournament]');
      const body = page.locator('#cs-body');
      await expect(body.locator('.cs-running-title')).toHaveText('進行中');
      await expect(body.locator('.cs-running .cs-card')).toHaveCount(1);
      await expect(body.locator('.cs-running .cs-card')).toContainText('No.1');
      await expect(body.locator('.cs-running .badge-running')).toBeVisible();
      await expect(body.locator('.cs-running .ni-elapsed')).toHaveText('0分');
      // 次に行う試合には、開始していない試合だけ
      const next = body.locator('.cs-list:not(.cs-running) .cs-card');
      await expect(next).toHaveCount(3); // 8人の1回戦は4試合、そのうち1つが進行中
      await expect(body).toContainText('次に行う試合');
      await expect(next.first()).not.toContainText('No.1 ');
    });

    test('総当たりも同じ: 開始・卓の状況・結果で終わる', async ({ page }) => {
      await open(page);
      await importNames(page, EIGHT);
      await page.click('[data-act=gen-league]');
      const c = page.locator('#panel-league .ni-card', { hasText: 'No.1' }).first();
      await c.locator('[data-start]').click();
      await expect(c).toHaveClass(/running/);
      await expect(page.locator('#panel-league .table-board .tb.busy')).toHaveCount(1);
      await expect(page.locator('#panel-league .table-board .tb.busy')).toContainText('No.1');
      await c.locator('.next-item').click();
      await enterScore(page, 3, 1);
      await expect(page.locator('#panel-league .table-board .tb.busy')).toHaveCount(0);
      await expect(page.locator('#panel-league .badge-running')).toHaveCount(0);
    });
  });
}

test('3位決定戦も開始できる', async ({ page }) => {
  await open(page);
  await importNames(page, ['A', 'B', 'C', 'D']);
  await page.check('#third-place');
  await page.click('[data-act=gen-tournament]');
  for (let i = 0; i < 2; i++) { await card(page, i + 1).locator('.next-item').click(); await enterScore(page, 2, 1); }
  const third = page.locator('#panel-tournament .ni-card', { hasText: 'No.3' }).first();
  await third.locator('[data-start]').click();
  await expect(third).toHaveClass(/running/);
});

test('過去の大会を見ているあいだは、進行中を出さない', async ({ page }) => {
  acceptDialogs(page);
  await startTournament(page, ['A', 'B', 'C', 'D']);
  await card(page, 1).locator('[data-start]').click(); // 終わらせないまま、次の回を始める
  await page.click('.tabs [data-tab=setup]');
  await page.click('#editions-card > summary');
  await page.click('#editions-card [data-edition=next]');
  await page.click('[data-edition-view="1"]');
  await expect(page.locator('#panel-tournament')).toBeVisible();
  await expect(page.locator('#panel-tournament .badge-running')).toHaveCount(0);
});
