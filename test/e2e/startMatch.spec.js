import { test, expect } from '@playwright/test';
import { open, importNames, enterScore, acceptDialogs, genTournament, openResultsFold } from './helpers.js';

const EIGHT = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎', '田中 三郎', '伊藤 四郎', '渡辺 五郎', '中村 六子'];

async function startTournament(page, names = EIGHT) {
  await open(page);
  await importNames(page, names);
  await genTournament(page);
}
// 卓ごとのカード（進行状況の欄）。tc(page, n) は第n卓のカード。「今」の行と「次」の行を持つ
const tc = (page, n, kind = 'tournament') => page.locator(`#panel-${kind} .table-board .tc`).nth(n - 1);
const now = (card) => card.locator('.tc-line').nth(0);
const nextRow = (card) => card.locator('.tc-line').nth(1);
const board = (page) => page.locator('#panel-tournament .table-board');
/** 試合番号の「次」の行にある開始ボタン（その卓の次の試合が No.n のとき） */
const startOf = (page, no, kind = 'tournament') => page.locator(`#panel-${kind} .table-board .tc`, { has: page.locator('.tc-line:nth-child(2)', { hasText: `No.${no} ` }) }).locator('[data-start]');

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test.describe(`試合の開始と卓の空き状況（幅${w}px）`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('卓のカードに「開始」ボタンが付き、押すと進行中になる（緑の枠・バッジ・経過時間・「結果を入力」）。取り消しは結果入力シートの中', async ({ page }) => {
      await startTournament(page);
      const c = tc(page, 1);
      await expect(c.locator('[data-start]')).toHaveText('開始');
      await expect(c).not.toHaveClass(/busy/);
      await c.locator('[data-start]').click();
      await expect(c).toHaveClass(/busy/);
      await expect(now(c).locator('.badge-running')).toHaveText('進行中');
      await expect(now(c).locator('.ni-elapsed')).toHaveText('0分');
      await expect(c.locator('[data-start]')).toHaveCount(0);
      await expect(c.locator('.tc-action [data-match]')).toHaveText('結果を入力');
      // ページに「開始を取り消す」のボタンは出ない（結果入力シートの中にある）
      await expect(page.locator('#panel-tournament [data-unstart]')).toHaveCount(0);
      // 他の卓は開始していない
      await expect(tc(page, 2)).not.toHaveClass(/busy/);
      // 結果入力シートを開くと「開始を取り消す」があり、押すと空きに戻る
      await c.locator('.tc-action [data-match]').click();
      await expect(page.locator('#rd-unstart')).toBeVisible();
      await page.click('#rd-unstart');
      await expect(page.locator('#result-dialog')).not.toHaveJSProperty('open', true);
      await expect(c).not.toHaveClass(/busy/);
      await expect(c.locator('.badge-running')).toHaveCount(0);
      await expect(c.locator('[data-start]')).toBeVisible();
      // 進行中でない試合の結果入力シートには、「開始を取り消す」は出ない
      await nextRow(c).locator('.next-item').click();
      await expect(page.locator('#rd-unstart')).toBeHidden();
    });

    test('卓のカード: 「今」は空き、「次」にその卓の次の試合。開始すると「今」が進行中（No.・対戦者・分）になり、「次」はその卓のその次の試合', async ({ page }) => {
      await startTournament(page);
      await expect(board(page).locator('.tc')).toHaveCount(2);
      const t1 = tc(page, 1);
      await expect(t1.locator('.tc-name')).toHaveText('第1卓');
      await expect(now(t1)).toContainText('空き');
      await expect(nextRow(t1)).toContainText(/No\.1\s*山田 太郎\s*vs\s*中村 六子/);
      await expect(nextRow(tc(page, 2))).toContainText('No.2');
      await t1.locator('[data-start]').click();
      await expect(t1).toHaveClass(/busy/);
      await expect(now(t1).locator('.badge-running')).toHaveText('進行中');
      await expect(now(t1)).toContainText(/No\.1\s*山田 太郎\s*vs\s*中村 六子（0分）/);
      // 進行中でも、その卓の次の試合を出す（8人・卓2つの第1卓は、次が No.3・時間帯2）
      await expect(nextRow(t1)).toContainText('No.3');
      await expect(nextRow(t1)).toContainText('時間帯2');
      await expect(now(tc(page, 2))).toContainText('空き'); // 第2卓は空いたまま
    });

    test('結果を保存すると、進行中は終わり、卓は空きに戻って、その卓の次の試合が「次」に出る', async ({ page }) => {
      await startTournament(page);
      await tc(page, 1).locator('[data-start]').click();
      await now(tc(page, 1)).locator('.next-item').click();
      await enterScore(page, 2, 1);
      const t1 = tc(page, 1);
      await expect(t1).toHaveClass(/free/);
      await expect(now(t1)).toContainText('空き');
      await expect(nextRow(t1)).toContainText('No.3'); // 終わった No.1 は出ない
      await expect(page.locator('#panel-tournament .table-board .badge-running')).toHaveCount(0);
    });

    test('試合結果一覧の状態も「進行中」になる（表とカード）', async ({ page }) => {
      await startTournament(page);
      await tc(page, 1).locator('[data-start]').click();
      if (w <= 700) await openResultsFold(page); // スマホ幅の一覧は折りたたまれている
      const sel = w > 700 ? '.results-table tr[data-match="R1-M1"] .badge' : '.result-cards [data-match="R1-M1"] .badge';
      await expect(page.locator(`#panel-tournament ${sel}`).first()).toHaveText('進行中');
      await expect(page.locator(`#panel-tournament ${sel.replace('R1-M1', 'R1-M2')}`).first()).toHaveText('試合待ち');
    });

    test('進行中の卓には「開始」ボタンが無い（同じ卓で2試合を同時に開始しない）。結果を入れて空きに戻れば、次の試合を開始できる', async ({ page }) => {
      await startTournament(page);
      await tc(page, 1).locator('[data-start]').click(); // No.1 を開始
      await expect(nextRow(tc(page, 1))).toContainText('No.3'); // 第1卓の次は No.3
      await expect(tc(page, 1).locator('[data-start]')).toHaveCount(0);
      await now(tc(page, 1)).locator('.next-item').click();
      await enterScore(page, 2, 1);
      await expect(tc(page, 1).locator('[data-start]')).toHaveCount(1);
      await tc(page, 1).locator('[data-start]').click(); // 次の試合（No.3）を開始
      await expect(now(tc(page, 1))).toContainText('No.3');
      await expect(tc(page, 1)).toHaveClass(/busy/);
    });

    test('経過時間（分）は、画面を描き直さなくても進む', async ({ page }) => {
      await page.clock.install({ time: new Date('2026-10-18T05:00:00Z') });
      await startTournament(page);
      await tc(page, 1).locator('[data-start]').click();
      await expect(now(tc(page, 1)).locator('.ni-elapsed')).toHaveText('0分');
      await page.clock.runFor(12 * 60 * 1000 + 30 * 1000);
      await expect(now(tc(page, 1)).locator('.ni-elapsed')).toHaveText('12分');
      await expect(now(tc(page, 1))).toContainText('（12分）');
    });

    test('開始は、保存・再読み込みしても残る', async ({ page }) => {
      await startTournament(page);
      await tc(page, 2).locator('[data-start]').click(); // 第2卓は No.2
      await page.reload();
      await page.click('.tabs [data-tab=tournament]');
      await expect(tc(page, 2)).toHaveClass(/busy/);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bukatsu-taikai:state')).tournament.started);
      expect(Object.keys(saved)).toEqual(['R1-M2']);
      expect(saved['R1-M2'].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('呼び出し画面: 「進行中」と「次に行う試合」を分けて出す', async ({ page }) => {
      await startTournament(page);
      await tc(page, 1).locator('[data-start]').click();
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
      const c = tc(page, 1, 'league');
      await c.locator('[data-start]').click();
      await expect(c).toHaveClass(/busy/);
      await expect(page.locator('#panel-league .table-board .tc.busy')).toHaveCount(1);
      await expect(page.locator('#panel-league .table-board .tc.busy')).toContainText('No.1');
      await now(c).locator('.next-item').click();
      await enterScore(page, 3, 1);
      await expect(page.locator('#panel-league .table-board .tc.busy')).toHaveCount(0);
      await expect(page.locator('#panel-league .badge-running')).toHaveCount(0);
    });
  });
}

test('3位決定戦も開始できる', async ({ page }) => {
  await open(page);
  await importNames(page, ['A', 'B', 'C', 'D']);
  await page.check('#third-place');
  await genTournament(page);
  for (let i = 0; i < 2; i++) { await nextRow(tc(page, i + 1)).locator('.next-item').click(); await enterScore(page, 2, 1); }
  // 準決勝が終わると、3位決定戦（No.3）が、その卓の「次」に出る。開始すると進行中になる
  await startOf(page, 3).click();
  await expect(page.locator('#panel-tournament .table-board .tc.busy')).toContainText('No.3');
});

test('過去の大会を見ているあいだは、進行中を出さない', async ({ page }) => {
  acceptDialogs(page);
  await startTournament(page, ['A', 'B', 'C', 'D']);
  await tc(page, 1).locator('[data-start]').click(); // 終わらせないまま、次の回を始める
  await page.click('.tabs [data-tab=setup]');
  await page.click('#editions-card > summary');
  await page.click('#editions-card [data-edition=next]');
  await page.click('[data-edition-view="1"]');
  await expect(page.locator('#panel-tournament')).toBeVisible();
  await expect(page.locator('#panel-tournament .badge-running')).toHaveCount(0);
});
