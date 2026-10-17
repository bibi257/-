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
  await page.click('[data-act=import]');
  await page.fill('#im-text', names.join('\n'));
  await page.check(`input[name=im-mode][value=${mode}]`);
  await page.click('#import-form button[type=submit]');
}

export async function setNumber(page, selector, value) {
  await page.fill(selector, String(value));
  await page.press(selector, 'Tab');
}

/** 結果入力ダイアログでスコアを入れて保存 */
export async function enterScore(page, s1, s2) {
  await page.fill('#rd-s1', String(s1));
  await page.fill('#rd-s2', String(s2));
  await page.click('#rd-ok');
}

export async function download(page, clickSelector) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(clickSelector)]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), bytes: await readFile(path) };
}

export function pngSize(bytes) {
  // PNG シグネチャと IHDR の幅・高さ
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((b, i) => bytes[i] === b)) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
