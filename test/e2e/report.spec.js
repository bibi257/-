import { test, expect } from '@playwright/test';
import { NAMES, open, importNames, acceptDialogs, enterScore, genTournament } from './helpers.js';

// 閲覧者からの結果の報告・運営の承認。画面と共有 API（Worker のコード）を同じオリジンで動かして確認する。本番の Cloudflare/D1 ではない
test.use({ baseURL: 'http://localhost:4174/' });
test.describe.configure({ mode: 'serial' });

const ADMIN_PW = 'admin-pass-1';

async function untilSynced(page, check, timeout = 15000) {
  await expect(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await check();
  }).toPass({ timeout, intervals: [300, 500, 1000] });
}

/** 運営と閲覧者の2人を用意し、閲覧者を共有に入れる */
async function pair(browser, ip) {
  const admin = await browser.newContext();
  const viewer = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await admin.setExtraHTTPHeaders({ 'x-test-ip': `${ip}.1` });
  await viewer.setExtraHTTPHeaders({ 'x-test-ip': `${ip}.2` });
  const a = await admin.newPage();
  const v = await viewer.newPage();
  acceptDialogs(a);
  acceptDialogs(v);
  await open(a);
  await importNames(a, NAMES);
  await genTournament(a);
  await a.waitForSelector('#bracket-wrap svg');
  await a.click('[data-action=share]');
  await a.fill('#sh-apw', ADMIN_PW);
  await a.fill('#sh-apwc', ADMIN_PW);
  await a.click('[data-sh=start]');
  await expect(a.locator('.sh-code')).toHaveText(/^[a-hj-km-np-z2-9]{8}$/);
  const link = await a.inputValue('#sh-link');
  await a.click('#sh-close');
  await v.goto(link);
  await expect(v.locator('#share-chip')).toContainText('閲覧中');
  return { admin, viewer, a, v };
}

const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('閲覧者が報告した結果は、運営が承認するまで表に出ない。承認すると表に反映され、閲覧者にも届く', async ({ browser }) => {
  const { admin, viewer, a, v } = await pair(browser, '10.8.0');

  await v.click('#tab-comments');
  await expect(v.locator('#report-form')).toBeVisible();
  expect(await noOverflow(v)).toBe(true); // 390px
  await expect(a.locator('#tab-comments')).not.toContainText('報告');

  // 試合を選び、スコアを入れると勝者が自動で選ばれる
  const firstLabel = (await v.locator('#rf-match option').first().textContent()).trim();
  await v.fill('#rf-s1', '3');
  await v.fill('#rf-s2', '1');
  await expect(v.locator('input[name=rf-outcome][value=p1]')).toBeChecked();
  await v.fill('#rf-name', '見学者');
  await v.click('#report-form button[type=submit]');
  await expect(v.locator('.toast')).toContainText('運営に報告しました');

  // 運営: タブに件数が出て、承認待ちに内容が出る。表にはまだ反映されない
  await untilSynced(a, () => expect(a.locator('#tab-comments')).toContainText('報告1', { timeout: 1000 }));
  await expect(a.locator('.results tbody tr.st-done')).toHaveCount(0);
  await a.click('#tab-comments');
  await expect(a.locator('.report')).toHaveCount(1);
  await expect(a.locator('.report')).toContainText('見学者');
  await expect(a.locator('.report')).toContainText('3 - 1');
  await expect(a.locator('.report')).toContainText(firstLabel.split('　')[0]);

  // 閲覧者の表にも反映されていない
  await v.click('.tabs [data-tab=tournament]');
  await expect(v.locator('.results tbody tr.st-done')).toHaveCount(0);

  // 承認 → 運営の表に反映され、報告は片付く
  await a.locator('[data-approve]').click();
  await expect(a.locator('.report')).toHaveCount(0);
  await expect(a.locator('#tab-comments')).not.toContainText('報告');
  await a.click('.tabs [data-tab=tournament]');
  await expect(a.locator('.results tbody tr.st-done')).toHaveCount(1);
  await expect(a.locator('.results tbody tr.st-done')).toContainText('3-1');

  // 閲覧者に届く。報告した試合は、もう報告の選択肢に出ない
  await untilSynced(v, () => expect(v.locator('.results tbody tr.st-done')).toHaveCount(1, { timeout: 1000 }));
  await v.click('#tab-comments');
  await expect(v.locator('#rf-match option', { hasText: firstLabel })).toHaveCount(0);

  await admin.close();
  await viewer.close();
});

test('運営は報告を却下できる（表は変わらない）。閲覧者は同じ試合を続けて報告できない', async ({ browser }) => {
  const { admin, viewer, a, v } = await pair(browser, '10.8.1');

  await v.click('#tab-comments');
  await v.locator('input[name=rf-outcome][value=p2]').check();
  await v.click('#report-form button[type=submit]');
  await expect(v.locator('.toast')).toContainText('運営に報告しました');

  // 同じ人が同じ試合をもう一度は送れない（サーバーが断り、文言が出る）
  await v.locator('input[name=rf-outcome][value=p1]').check();
  await v.click('#report-form button[type=submit]');
  await expect(v.locator('#rf-error')).toContainText('すでに報告済み');

  await a.click('#tab-comments');
  await untilSynced(a, () => expect(a.locator('.report')).toHaveCount(1, { timeout: 1000 }));
  await a.locator('[data-reject]').click();
  await expect(a.locator('.report')).toHaveCount(0);
  await a.click('.tabs [data-tab=tournament]');
  await expect(a.locator('.results tbody tr.st-done')).toHaveCount(0);

  await admin.close();
  await viewer.close();
});

test('運営が先に結果を入れた試合の報告は、承認できず（上書きしない）、削除だけできる。入力の誤りは送る前に分かる', async ({ browser }) => {
  const { admin, viewer, a, v } = await pair(browser, '10.8.2');

  await v.click('#tab-comments');
  // スコアと勝者の矛盾は、送る前に画面で止まる
  await v.fill('#rf-s1', '3');
  await v.fill('#rf-s2', '1');
  await v.locator('input[name=rf-outcome][value=p2]').check();
  await v.click('#report-form button[type=submit]');
  await expect(v.locator('#rf-error')).toContainText('一致しません');
  await v.locator('input[name=rf-outcome][value=p1]').check();
  await v.click('#report-form button[type=submit]');
  await expect(v.locator('.toast')).toContainText('運営に報告しました');

  // 運営が同じ試合に別の結果を入力した
  await a.click('.tabs [data-tab=tournament]');
  await a.locator('g.match').first().click();
  await enterScore(a, 0, 2);
  await a.click('#tab-comments');
  await untilSynced(a, () => expect(a.locator('.report')).toHaveCount(1, { timeout: 1000 }));
  await expect(a.locator('.report .error')).toContainText('すでに結果');
  await expect(a.locator('[data-approve]')).toHaveCount(0);
  await a.locator('[data-reject]').click();
  await expect(a.locator('.report')).toHaveCount(0);
  await a.click('.tabs [data-tab=tournament]');
  await expect(a.locator('.results tbody tr.st-done').first()).toContainText('0-2'); // 運営の入力が残る

  await admin.close();
  await viewer.close();
});
