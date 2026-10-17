import { test, expect } from '@playwright/test';
import { NAMES, open, importNames, acceptDialogs, enterScore } from './helpers.js';

// 共有機能: 画面と共有 API（Worker のコード）を同じオリジンで動かして確認する。本番の Cloudflare/D1 ではない
test.use({ baseURL: 'http://localhost:4174/' });
test.describe.configure({ mode: 'serial' });

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
  await page.fill('#sh-apw', ADMIN_PW);
  await page.fill('#sh-apwc', ADMIN_PW);
  await page.click('[data-sh=start]');
  await expect(page.locator('.sh-code')).toHaveText(/^[a-hj-km-np-z2-9]{8}$/);
  return (await page.locator('.sh-code').textContent()).trim();
}

async function makeTournament(page) {
  await importNames(page, NAMES);
  await page.click('[data-act=gen-tournament]');
  await page.waitForSelector('#bracket-wrap svg');
}

test('運営が共有を始め、閲覧者はリンクを開くだけで見られ、結果の更新とコメントが反映される', async ({ browser }) => {
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

  // 閲覧者: リンクを開くだけ（パスワード入力もダイアログも無し）で表が見える
  await v.goto(link);
  await expect(v.locator('#bracket-wrap svg')).toBeVisible();
  await expect(v.locator('#share-dialog')).not.toBeVisible();
  await expect(v.locator('#share-chip')).toContainText('閲覧中');

  // 閲覧専用: 設定タブや編集ボタンが無い。試合をクリックしても入力ダイアログは開かない
  await expect(v.locator('[data-tab=setup]')).toBeHidden();
  await expect(v.locator('[data-action=save]')).toBeHidden();
  await v.locator('g.match').first().click();
  await expect(v.locator('#result-dialog')).not.toBeVisible();
  // 閲覧者の端末の自動保存は、閲覧データで上書きされない
  expect(await v.evaluate(() => localStorage.getItem('bukatsu-taikai:state'))).toBeNull();

  // 運営が結果を入力すると、閲覧者に反映される
  await a.click('.tabs [data-tab=tournament]');
  await a.locator('g.match').first().click();
  await enterScore(a, 3, 1);
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

test('運営用パスワードを変えても閲覧は続く。共有を終了すると閲覧者は切断される', async ({ browser }) => {
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

  // 閲覧者: 共有コードだけで入る（パスワード欄は無い）
  await v.goto('/');
  await v.click('[data-action=share]');
  await expect(v.locator('section.sh-section', { hasText: '共有を見る' }).locator('input[type=password]')).toHaveCount(0); // 閲覧にパスワード欄は無い
  await v.fill('#sh-code', code);
  await v.click('[data-sh=join]');
  await expect(v.locator('#bracket-wrap svg')).toBeVisible();
  await v.click('#sh-close');

  // 運営用パスワードを変更 → 運営はそのまま使え、閲覧者も影響を受けない
  await a.locator('.sh-details summary').first().click();
  await a.fill('#sh-newa', 'new-admin-pass');
  await a.click('[data-sh=pw-admin]');
  await expect(a.locator('#toast')).toContainText('変更しました');
  await a.click('[data-sh=push]');
  await expect(a.locator('#share-chip')).not.toContainText('再ログイン');
  await untilSynced(v, () => expect(v.locator('#share-chip')).toContainText('閲覧中', { timeout: 1000 }));
  await expect(v.locator('#share-dialog')).not.toBeVisible();

  // 古い運営用パスワードでは、運営として再接続できない
  await a.click('[data-sh=disconnect]');
  await a.locator('.sh-details summary').first().click();
  await a.fill('#sh-code2', code);
  await a.fill('#sh-apw2', ADMIN_PW);
  await a.click('[data-sh=admin]');
  await expect(a.locator('#sh-error')).toContainText('違います');
  await a.fill('#sh-apw2', 'new-admin-pass');
  await a.click('[data-sh=admin]');
  await expect(a.locator('.sh-code')).toHaveText(code);

  // 共有を終了
  await a.click('[data-sh=close]');
  await expect(a.locator('#share-chip')).toBeHidden();
  await untilSynced(v, () => expect(v.locator('#share-chip')).toBeHidden({ timeout: 1000 }));
  await expect(v.locator('[data-tab=setup]')).toBeVisible();

  await admin.close();
  await viewer.close();
});

test('自分の大会データがある端末で閲覧リンクを開くと、確認してから入り、やめると元のデータに戻る', async ({ browser }) => {
  const admin = await browser.newContext();
  const other = await browser.newContext();
  await withIp(admin, '10.0.2.1');
  await withIp(other, '10.0.2.2');
  const a = await admin.newPage();
  const o = await other.newPage();
  const dialogs = acceptDialogs(o);
  acceptDialogs(a);
  await open(a);
  await makeTournament(a);
  const code = await startShare(a);
  const link = await a.inputValue('#sh-link');

  await open(o);
  await importNames(o, ['自分 一郎', '自分 二郎']);
  await o.goto(link);
  // 自動では入らず、共有コードが入力済みのダイアログが出る
  await expect(o.locator('#share-dialog')).toBeVisible();
  await expect(o.locator('#sh-code')).toHaveValue(code);
  await expect(o.locator('#share-chip')).toBeHidden();
  await o.click('[data-sh=join]');
  await expect(o.locator('#bracket-wrap svg')).toBeVisible();
  expect(dialogs.some((m) => m.includes('この端末の大会データは表示されません'))).toBe(true);
  await o.click('#sh-close');

  await o.click('#share-chip');
  await o.click('[data-sh=disconnect]');
  await o.click('#sh-close');
  await o.click('.tabs [data-tab=setup]');
  await expect(o.locator('#panel-setup')).toContainText('参加者 2人');
  const names = await o.evaluate(() => JSON.parse(localStorage.getItem('bukatsu-taikai:state')).players.map((p) => p.name));
  expect(names).toEqual(['自分 一郎', '自分 二郎']); // 閲覧中も、この端末の保存データは書き換わらない

  await admin.close();
  await other.close();
});

test('共有サーバーに接続できないときは、分かる文言を出して入力内容を保つ', async ({ page }) => {
  await open(page);
  await page.click('[data-action=share]');
  await page.fill('#sh-base', 'http://localhost:1');
  await page.fill('#sh-apw', ADMIN_PW);
  await page.fill('#sh-apwc', ADMIN_PW);
  await page.click('[data-sh=start]');
  await expect(page.locator('#sh-error')).toContainText('接続できませんでした');
  await expect(page.locator('#sh-apw')).toHaveValue(ADMIN_PW);
  await page.fill('#sh-apwc', 'different');
  await page.click('[data-sh=start]');
  await expect(page.locator('#sh-error')).toContainText('一致しません');
  await page.fill('#sh-apw', 'abc');
  await page.fill('#sh-apwc', 'abc');
  await page.click('[data-sh=start]');
  await expect(page.locator('#sh-error')).toContainText('6文字以上');
});

test('共有中に次の回を始めると、閲覧者の画面も新しい回（表なし）に変わる。「次の回を始める」は閲覧者に出ない', async ({ browser }) => {
  const admin = await browser.newContext();
  const viewer = await browser.newContext();
  await withIp(admin, '10.0.3.1');
  await withIp(viewer, '10.0.3.2');
  const a = await admin.newPage();
  const v = await viewer.newPage();
  const dialogs = acceptDialogs(a);
  acceptDialogs(v);
  await open(a);
  await makeTournament(a);
  const code = await startShare(a);
  const link = await a.inputValue('#sh-link');
  await a.click('#sh-close');

  await v.goto(link);
  await expect(v.locator('#bracket-wrap svg')).toBeVisible();
  await expect(v.locator('#print-title')).toHaveText('部内大会');

  // 運営が次の回を始める（確認に「閲覧者の画面も変わる」と出る）
  await a.click('.tabs [data-tab=setup]');
  await a.click('#editions-card [data-edition=next]');
  expect(dialogs.some((m) => m.includes('閲覧者の画面も新しい回の内容に変わります'))).toBe(true);
  await untilSynced(v, () => expect(v.locator('#print-title')).toHaveText('部内大会 第2回', { timeout: 1000 }));
  await expect(v.locator('#panel-tournament')).toContainText('まだ作成されていません');
  // 閲覧者には「次の回を始める」・過去の回の一覧（運営用のカード）は出ない
  await expect(v.locator('[data-edition=next]')).toBeHidden();
  await expect(v.locator('#editions-card')).toBeHidden();

  // 運営が過去の回を見ている間は共有に関する操作は隠れ、戻れば共有中の表示が戻る
  await a.click('[data-edition-view="1"]');
  await expect(a.locator('#share-chip')).toBeHidden();
  await a.click('#edition-banner [data-edition=back]');
  await expect(a.locator('#share-chip')).toContainText(code);
  await a.close();
  await v.close();
  await admin.close();
  await viewer.close();
});

test('閲覧者も過去の回の結果を見られる。見ている間に運営が進めても画面は変わらず、戻ると最新が出る', async ({ browser }) => {
  const admin = await browser.newContext();
  const viewer = await browser.newContext();
  await withIp(admin, '10.0.4.1');
  await withIp(viewer, '10.0.4.2');
  const a = await admin.newPage();
  const v = await viewer.newPage();
  acceptDialogs(a);
  acceptDialogs(v);
  await open(a);
  await importNames(a, ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎']);
  await a.click('[data-act=gen-tournament]');
  for (let i = 0; i < 3; i++) {
    await a.locator('.next-item').first().click();
    await enterScore(a, 2, 1);
  }
  await startShare(a);
  const link = await a.inputValue('#sh-link');
  await a.click('#sh-close');
  // 第2回を始めて、表を作る（まだ結果は無い）
  await a.click('.progress [data-edition=next]');
  await a.click('[data-act=gen-tournament]');
  await a.waitForSelector('#bracket-wrap svg');

  // 閲覧者: 現在の回（第2回）が開き、「過去の回の結果も見られます」が出る
  await v.goto(link);
  await untilSynced(v, () => expect(v.locator('#print-title')).toHaveText('部内大会 第2回', { timeout: 1000 })); // 運営の送信を待つ
  await expect(v.locator('.results tbody tr.st-done')).toHaveCount(0);
  await expect(v.locator('#edition-banner')).toContainText('過去の回の結果も見られます');
  await expect(v.locator('#eb-select-past option')).toHaveText(['選んでください', '第1回']);

  // 第1回を選ぶと、結果が見える。閲覧専用で、コメントタブや共有は隠れる
  await v.selectOption('#eb-select-past', '1');
  await expect(v.locator('#edition-banner')).toContainText('第1回の記録を見ています');
  await expect(v.locator('#print-title')).toHaveText('部内大会 第1回');
  await expect(v.locator('.results tbody tr.st-done')).toHaveCount(3);
  await expect(v.locator('#tab-comments')).toBeHidden();
  await expect(v.locator('[data-tab=setup]')).toBeHidden();
  await v.locator('g.match').first().click();
  await expect(v.locator('#result-dialog')).not.toBeVisible();

  // 見ている間に運営が第2回の結果を入れても、第1回の画面は変わらない
  await a.locator('.next-item').first().click();
  await enterScore(a, 3, 0);
  await a.waitForTimeout(2500); // 運営の送信（1.5秒の待ち）を待つ
  await v.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await v.waitForTimeout(800);
  await expect(v.locator('#print-title')).toHaveText('部内大会 第1回');
  await expect(v.locator('.results tbody tr.st-done')).toHaveCount(3);

  // 現在の回に戻ると、最新（第2回の結果が1試合）が出る。閲覧専用のまま
  await v.click('#edition-banner [data-edition=back]');
  await expect(v.locator('#print-title')).toHaveText('部内大会 第2回');
  await expect(v.locator('.results tbody tr.st-done')).toHaveCount(1);
  await expect(v.locator('#share-chip')).toContainText('閲覧中');
  await expect(v.locator('[data-tab=setup]')).toBeHidden();

  // 見ている回を運営が削除すると、閲覧者の画面は現在の回に戻り、選択肢も消える
  await v.selectOption('#eb-select-past', '1');
  await expect(v.locator('#edition-banner')).toContainText('第1回の記録を見ています');
  await a.click('.tabs [data-tab=setup]');
  await a.click('[data-edition-del="1"]');
  await untilSynced(v, () => expect(v.locator('#edition-banner')).toBeHidden({ timeout: 1000 }));
  await expect(v.locator('#print-title')).toHaveText('部内大会');
  await expect(v.locator('.results tbody tr.st-done')).toHaveCount(1);

  await admin.close();
  await viewer.close();
});
