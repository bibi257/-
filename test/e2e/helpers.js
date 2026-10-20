import { readFile } from 'node:fs/promises';

export const NAMES = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎', '田中 三郎', '伊藤 四郎', '渡辺 五郎'];

/** 確認ダイアログ（confirm）を記録しつつ OK する */
export function acceptDialogs(page) {
  const messages = [];
  page.on('dialog', async (d) => {
    messages.push(d.message());
    await d.accept();
  });
  return messages;
}

export async function open(page) {
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
}

export async function importNames(page, names, mode = 'append') {
  await page.click('.h2-actions [data-act=import]');
  await page.fill('#im-text', names.join('\n'));
  await page.check(`input[name=im-mode][value=${mode}]`);
  await page.click('#import-form button[type=submit]');
}

export async function setNumber(page, selector, value) {
  await page.fill(selector, String(value));
  await page.press(selector, 'Tab');
}

/** 「トーナメント表を作成」を押し、組み合わせの確認（F4）をそのまま確定する */
export async function genTournament(page) {
  await page.click('[data-act=gen-tournament]');
  await page.click('#pr-ok');
}

/** スマホ幅で閉じている「試合結果一覧」の折りたたみを開く（PC 幅や表の表示では常に開いているので、何もしない） */
export async function openResultsFold(page) {
  const d = page.locator('details.fold[data-fold]').first();
  if ((await d.count()) && !(await d.evaluate((el) => el.open))) await d.locator('summary').click();
}

/** 試合番号がいちばん小さい「今・次」の行（卓ごとのカードは卓の順に並ぶので、番号順の先頭とは限らない）。scope は '#panel-tournament' など */
export async function lowestNextItem(page, scope = '') {
  const items = page.locator(`${scope} .next-item`.trim());
  const nos = await items.evaluateAll((els) => els.map((e) => Number(/No\.(\d+)/.exec(e.textContent)?.[1] ?? Infinity)));
  return items.nth(nos.indexOf(Math.min(...nos)));
}

/** 結果入力ダイアログでスコアを入れて保存 */
export async function enterScore(page, s1, s2) {
  await page.fill('#rd-s1', String(s1));
  await page.fill('#rd-s2', String(s2));
  await page.click('#rd-ok');
}

/** 「出力」メニューの項目（data-export）を押す。メニューが閉じていれば、先に開く */
export async function clickExport(page, selector) {
  const item = page.locator(selector).first();
  if (!(await item.isVisible())) await item.locator('xpath=ancestor::*[contains(@class,"export-menu")]').locator('[data-export-toggle]').click();
  await item.click();
}

export async function download(page, clickSelector) {
  const [dl] = await Promise.all([page.waitForEvent('download'), clickSelector.includes('data-export') ? clickExport(page, clickSelector) : page.click(clickSelector)]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), bytes: await readFile(path) };
}

export function pngSize(bytes) {
  // PNG シグネチャと IHDR の幅・高さ
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((b, i) => bytes[i] === b)) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
