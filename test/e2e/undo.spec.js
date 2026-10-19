import { test, expect } from '@playwright/test';
import { open, importNames, enterScore, genTournament, acceptDialogs } from './helpers.js';

const FOUR = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎'];
const KEY = 'bukatsu-taikai:state';
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
const undoBtn = (page) => page.locator('#undo-btn');

/** 「元に戻す」を押す（スマホ幅では、メニューを開いてから） */
async function clickUndo(page) {
  if (await page.locator('#menu-btn').isVisible()) await page.click('#menu-btn');
  await undoBtn(page).click();
}

async function setup(page, names = FOUR) {
  await open(page);
  await importNames(page, names);
}

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test.describe(`元に戻す（幅${w}px）`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('操作が無いうちは押せない。操作すると押せるようになり、押すと戻る。全部戻すとまた押せなくなる', async ({ page }) => {
      await open(page);
      await expect(undoBtn(page)).toBeDisabled();
      await importNames(page, FOUR);
      expect((await saved(page)).players).toHaveLength(4);
      if (w <= 700) await page.click('#menu-btn');
      await expect(undoBtn(page)).toBeEnabled();
      if (w <= 700) await page.click('#menu-btn');
      await page.fill('#new-player', '渡辺 五郎');
      await page.press('#new-player', 'Enter');
      await expect(page.locator('input.name')).toHaveCount(5);
      await clickUndo(page);
      await expect(page.locator('#toast')).toContainText('元に戻しました');
      await expect(page.locator('input.name')).toHaveCount(4);
      await expect.poll(async () => (await saved(page)).players.length).toBe(4); // 保存も戻っている
      await clickUndo(page);
      await expect(page.locator('input.name')).toHaveCount(0); // 名簿の取り込みも戻る
      if (w <= 700) await page.click('#menu-btn');
      await expect(undoBtn(page)).toBeDisabled();
    });

    test('表の作成と結果の保存・取り消しを戻せる。勝者の反映も一緒に戻る', async ({ page }) => {
      await setup(page);
      await genTournament(page);
      await page.locator('.next-item').first().click();
      await enterScore(page, 2, 1);
      await expect(page.locator('#result-dialog')).not.toBeVisible();
      expect(Object.keys((await saved(page)).tournament.results)).toHaveLength(1);
      await expect(page.locator('#panel-tournament .progress')).toContainText('1 / 3');
      await clickUndo(page);
      await expect(page.locator('#panel-tournament .progress')).toContainText('0 / 3');
      expect(Object.keys((await saved(page)).tournament.results)).toHaveLength(0);
      await clickUndo(page); // 表の作成
      await expect(page.locator('#panel-tournament')).toContainText('まだ作成されていません');
      expect((await saved(page)).tournament).toBeNull();
    });

    test('参加者の並べ替え・削除を戻せる', async ({ page }) => {
      await setup(page);
      const dialogs = acceptDialogs(page);
      await page.click('[data-act=down][data-i="0"]');
      await expect(page.locator('input.name').first()).toHaveValue('佐藤 花子');
      await clickUndo(page);
      await expect(page.locator('input.name').first()).toHaveValue('山田 太郎');
      await page.click('[data-act=del][data-i="1"]');
      expect(dialogs.some((m) => m.includes('削除しますか'))).toBe(true);
      await expect(page.locator('input.name')).toHaveCount(3);
      await clickUndo(page);
      await expect(page.locator('input.name')).toHaveCount(4);
      await expect(page.locator('input.name').nth(1)).toHaveValue('佐藤 花子');
    });

    test('名前欄への連続した入力は、1回の「元に戻す」で、入力する前に戻る', async ({ page }) => {
      await setup(page);
      const first = page.locator('input.name').first();
      await first.click();
      await first.fill('');
      await first.pressSequentially('あいうえお', { delay: 30 });
      await expect.poll(async () => (await saved(page)).players[0].name).toBe('あいうえお');
      await page.locator('#panel-setup h2').first().click(); // 入力欄から離れる
      await clickUndo(page);
      await expect(page.locator('input.name').first()).toHaveValue('山田 太郎');
      expect((await saved(page)).players[0].name).toBe('山田 太郎');
    });

    test('履歴は最大20件。それより前には戻れない', async ({ page }) => {
      await setup(page, ['A']);
      for (let i = 0; i < 24; i++) {
        await page.fill('#new-player', `P${i}`);
        await page.press('#new-player', 'Enter');
      }
      await expect(page.locator('input.name')).toHaveCount(25);
      let n = 0;
      while (n < 40) {
        if (w <= 700) { await page.click('#menu-btn'); const dis = await undoBtn(page).isDisabled(); await page.click('#menu-btn'); if (dis) break; } else if (await undoBtn(page).isDisabled()) break;
        await clickUndo(page);
        n++;
      }
      expect(n).toBe(20);
      await expect(page.locator('input.name')).toHaveCount(5); // 25 から 20 回戻る
    });
  });
}

test.describe('元に戻す（キーボード・再読み込み・閲覧専用）', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Ctrl+Z で戻せる。入力欄にフォーカスがあるときは、入力した文字の取り消しを優先して、戻さない', async ({ page }) => {
    await setup(page);
    await page.fill('#new-player', '渡辺 五郎');
    await page.press('#new-player', 'Enter');
    await expect(page.locator('input.name')).toHaveCount(5);
    // 入力欄（追加の欄にフォーカスが残っている）では、大会データは戻さない
    await page.focus('#new-player');
    await page.keyboard.press('Control+z');
    await expect(page.locator('input.name')).toHaveCount(5);
    // 入力欄の外では戻る
    await page.locator('#panel-setup h2').first().click();
    await page.keyboard.press('Control+z');
    await expect(page.locator('input.name')).toHaveCount(4);
    await expect(page.locator('#toast')).toContainText('元に戻しました');
    // Shift 付き（やり直し）では何もしない
    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('input.name')).toHaveCount(4);
  });

  test('ダイアログが開いている間は、Ctrl+Z で大会データを戻さない', async ({ page }) => {
    await setup(page);
    await genTournament(page);
    await page.locator('.next-item').first().click();
    await expect(page.locator('#result-dialog')).toBeVisible();
    await page.keyboard.press('Control+z');
    expect((await saved(page)).tournament).not.toBeNull();
    await page.click('#rd-cancel');
  });

  test('再読み込みすると履歴は消える', async ({ page }) => {
    await setup(page);
    await expect(undoBtn(page)).toBeEnabled();
    await page.reload();
    await expect(undoBtn(page)).toBeDisabled();
    expect((await saved(page)).players).toHaveLength(4);
  });

  test('過去の大会を見ている間は使えない（Ctrl+Z でも、今の大会は書き換わらない）', async ({ page }) => {
    acceptDialogs(page);
    await setup(page);
    await genTournament(page);
    for (let i = 0; i < 3; i++) {
      await page.locator('.next-item').first().click();
      await enterScore(page, 2, 1);
      await expect(page.locator('#result-dialog')).not.toBeVisible();
    }
    await page.click('.progress [data-edition=next]');
    await expect(page.locator('#editions-card')).toContainText('今は第2回大会');
    await page.click('[data-edition-view="1"]');
    await expect(page.locator('#edition-banner')).toBeVisible();
    await expect(undoBtn(page)).toBeDisabled();
    await page.locator('#panel-tournament').click();
    await page.keyboard.press('Control+z');
    await expect(page.locator('#edition-banner')).toBeVisible();
    const before = await saved(page);
    expect(before.history).toHaveLength(1);
    expect(before.tournament).toBeNull();
  });
});
