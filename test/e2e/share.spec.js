import { test, expect } from '@playwright/test';
import { NAMES, open, importNames, acceptDialogs, enterScore } from './helpers.js';

// 共有機能: 画面と共有 API（Worker のコード）を同じオリジンで動かして確認する。本番の Cloudflare/D1 ではない
test.use({ baseURL: 'http://localhost:4174/' });
test.describe.configure({ mode: 'serial' });

const VIEW_PW = 'view-pass-1';
const ADMIN_PW = 'admin-pass-1';

/** 部屋ごとに別の IP として扱わせ、作成回数の制限に当たらないようにする */
async function withIp(context, ip) {
  await context.setExtraHTTPHeaders({ 'x-test-ip': ip });
}

/** 条件が満たされるまで、画面を前面に戻した扱い（即時の更新確認）を繰り返し発火する。15秒の定期更新を待たないため */
async function untilSynced(page, check, timeout = 15000) {
  await expect(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await check();
  }).toPass({ timeout, intervals: [300, 500, 1000] });
}

async function startShare(page) {
  await page.click('[data-action=share]');
  await page.fill('#sh-vpw', VIEW_PW);
  await page.fill('#sh-apw', ADMIN_PW);
  await page.click('[data-sh=start]');
  await expect(page.locator('.sh-code')).toHaveText(/^[a-hj-km-np-z2-9]{8}$/);
  return (await page.locator('.sh-code').textContent()).trim();
}

async function makeTournament(page) {
  await importNames(page, NAMES);
  await page.click('[data-act=gen-tournament]');
  await page.waitForSelector('#bracket-wrap svg');
}

test('運営が共有を始め、閲覧者が見て、結果の更新とコメントが反映される', async ({ browser }) => {
  const admin = await browser.newContext();
  const viewer = await browser.newContext();
  await withIp(admin, '10.0.0.1');
  await withIp(viewer, '10.0.0.2');
  const a = await admin.newPage();
  const v = await viewer.newPage();
  acceptDialogs(a);
  acceptDialogs(v);

  await open(a);
  await makeTournament(a);
  const code = await startShare(a);
  const link = await a.inputValue('#sh-link');
  expect(link).toBe(`http://localhost:4174/#v=${code}`);
  await a.click('#sh-close');
  await expect(a.locator('#share-chip')).toContainText(code);

  // 閲覧者: リンクを開くとコードが入力済み。閲覧パスワードで入る
  await v.goto(link);
  await v.evaluate(() => { sessionStorage.clear(); });
  await expect(v.locator('#sh-code')).toHaveValue(code);
  await v.fill('#sh-vpw2', 'wrong-password');
  await v.click('[data-sh=join]');
  await expect(v.locator('#sh-error')).toContainText('違います');
  await v.fill('#sh-vpw2', VIEW_PW);
  await v.click('[data-sh=join]');
  await expect(v.locator('.sh-code')).toHaveText(code);
  await v.click('#sh-close');

  // 閲覧専用: 設定タブや編集ボタンが無く、表が見える。試合をクリックしても入力ダイアログは開かない
  await expect(v.locator('#bracket-wrap svg')).toBeVisible();
  await expect(v.locator('[data-tab=setup]')).toBeHidden();
  await expect(v.locator('[data-action=save]')).toBeHidden();
  await expect(v.locator('#share-chip')).toContainText('閲覧中');
  await v.locator('g.match').first().click();
  await expect(v.locator('#result-dialog')).not.toBeVisible();
  // 閲覧者の端末の自動保存は、閲覧データで上書きされない
  expect(await v.evaluate(() => localStorage.getItem('bukatsu-taikai:state'))).toBeNull();

  // 運営が結果を入力すると、閲覧者に反映される（15秒の定期更新を待たず、画面を戻して即時更新）
  await a.click('.tabs [data-tab=tournament]');
  await a.locator('g.match').first().click();
  await enterScore(a, 3, 1);
  await expect(a.locator('#share-chip')).not.toContainText('送信中');
  await untilSynced(v, () => expect(v.locator('.results tbody tr.st-done')).toHaveCount(1, { timeout: 1000 }));
  await expect(v.locator('.results tbody tr.st-done')).toContainText('3-1');

  // 閲覧者のコメント
  await v.click('#tab-comments');
  await v.fill('#cf-name', '見学者');
  await v.fill('#cf-text', '<b>がんばれ</b>\n応援しています');
  await v.click('#comment-form button[type=submit]');
  await expect(v.locator('.comment').first()).toContainText('見学者');
  await expect(v.locator('.comment').first()).toContainText('<b>がんばれ</b>'); // タグとして解釈されない
  expect(await v.locator('.comment b').count()).toBe(1); // 名前の <b> だけ（本文の <b> は文字）
  await expect(v.locator('[data-del]')).toHaveCount(0); // 閲覧者は削除できない

  // 運営側にも出て、削除できる
  await a.click('#tab-comments');
  await untilSynced(a, () => expect(a.locator('.comment').first()).toContainText('応援しています', { timeout: 1000 }));
  await a.locator('[data-del]').first().click();
  await expect(a.locator('.comment')).toHaveCount(0);
  await a.locator('.comment-list .empty').waitFor();

  // 閲覧をやめると、この端末の元のデータ（空）に戻る
  await v.click('#share-chip');
  await v.click('[data-sh=disconnect]');
  await v.click('#sh-close');
  await expect(v.locator('[data-tab=setup]')).toBeVisible();
  await expect(v.locator('#share-chip')).toBeHidden();

  await admin.close();
  await viewer.close();
});

test('閲覧用パスワードを変えると今の閲覧者は入り直しが必要になる。共有を終了すると見られなくなる', async ({ browser }) => {
  const admin = await browser.newContext();
  const viewer = await browser.newContext();
  await withIp(admin, '10.0.1.1');
  await withIp(viewer, '10.0.1.2');
  const a = await admin.newPage();
  const v = await viewer.newPage();
  acceptDialogs(a);
  acceptDialogs(v);
  await open(a);
  await makeTournament(a);
  const code = await startShare(a);

  await v.goto('/');
  await v.click('[data-action=share]');
  await v.fill('#sh-code', code);
  await v.fill('#sh-vpw2', VIEW_PW);
  await v.click('[data-sh=join]');
  await expect(v.locator('#bracket-wrap svg')).toBeVisible();
  await v.click('#sh-close');

  // 閲覧用パスワードを変更 → 閲覧者は次の更新で「再ログインが必要」になる
  await a.locator('.sh-details summary').first().click();
  await a.fill('#sh-newv', 'new-view-pass');
  await a.click('[data-sh=pw-viewer]');
  await untilSynced(v, () => expect(v.locator('#share-dialog')).toBeVisible({ timeout: 1000 }));
  await expect(v.locator('#share-body')).toContainText('認証が切れました');
  await v.fill('#sh-pw', 'new-view-pass');
  await v.click('[data-sh=relogin]');
  await expect(v.locator('#share-chip')).toContainText('閲覧中');
  await v.click('#sh-close');

  // 共有を終了
  await a.click('[data-sh=close]');
  await expect(a.locator('#share-chip')).toBeHidden();
  await untilSynced(v, () => expect(v.locator('#share-chip')).toBeHidden({ timeout: 1000 }));
  await expect(v.locator('[data-tab=setup]')).toBeVisible();

  await admin.close();
  await viewer.close();
});

test('共有サーバーに接続できないときは、分かる文言を出して入力内容を保つ', async ({ page }) => {
  await open(page);
  await page.click('[data-action=share]');
  await page.fill('#sh-base', 'http://localhost:1');
  await page.fill('#sh-vpw', VIEW_PW);
  await page.fill('#sh-apw', ADMIN_PW);
  await page.click('[data-sh=start]');
  await expect(page.locator('#sh-error')).toContainText('接続できませんでした');
  await expect(page.locator('#sh-vpw')).toHaveValue(VIEW_PW);
  await page.fill('#sh-vpw', 'abc');
  await page.click('[data-sh=start]');
  await expect(page.locator('#sh-error')).toContainText('6文字以上');
});
