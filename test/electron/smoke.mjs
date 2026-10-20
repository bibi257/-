// Electron 版の起動確認。
//   ローカル: node test/electron/smoke.mjs            （node_modules の electron で起動）
//   パッケージ版: APP_EXE=dist/win-unpacked/bukatsu-taikai.exe node test/electron/smoke.mjs
import { _electron as electron } from '@playwright/test';

const exe = process.env.APP_EXE;
const args = exe ? [] : ['.'];
if (process.platform === 'linux') args.unshift('--no-sandbox', '--ozone-platform=headless');

const app = await electron.launch({
  ...(exe ? { executablePath: exe } : {}),
  args,
  env: { ...process.env, LANG: process.env.LANG || 'C.UTF-8' },
  timeout: 60000,
});
const fail = (msg) => { console.error(`NG: ${msg}`); process.exitCode = 1; };
try {
  const win = await app.firstWindow();
  win.on('dialog', (d) => d.accept());
  await win.waitForSelector('#panel-setup .card');
  // 前回の自動保存が残っていると名前が重複するため、空の状態から始める
  await win.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await win.reload();
  await win.waitForSelector('#panel-setup .card');
  const title = await win.title();
  if (!title.includes('部内大会トーナメント')) fail(`タイトルが違います: ${title}`);
  await win.click('[data-act=import]');
  await win.fill('#im-text', '山田\n佐藤\n鈴木\n高橋\n田中');
  await win.click('#import-form button[type=submit]');
  await win.click('[data-act=gen-tournament]');
  await win.click('#pr-ok'); // 組み合わせの確認（F4）をそのまま確定する
  await win.locator('#panel-tournament .next-item').first().click();
  await win.fill('#rd-s1', '2');
  await win.fill('#rd-s2', '0');
  await win.click('#rd-ok');
  const progress = (await win.locator('#panel-tournament .progress').textContent()).replace(/\s+/g, ' ');
  if (!progress.includes('1 / 4')) fail(`結果が反映されていません: ${progress}`);
  // 呼び出し画面を別ウィンドウ（アプリの BrowserWindow）で開き、運営の画面の入力が file:// でも届くか（N9）
  await win.click('#panel-tournament [data-call=tournament]');
  const [callWin] = await Promise.all([app.waitForEvent('window'), win.click('#cs-window')]);
  await callWin.waitForSelector('#call-screen[open]');
  if (!callWin.url().includes('view=call')) fail(`呼び出し画面の URL が違います: ${callWin.url()}`);
  if (app.windows().length !== 2) fail(`ウィンドウ数が違います: ${app.windows().length}`);
  const before = (await callWin.locator('#cs-progress').textContent()).trim();
  await win.locator('#panel-tournament .next-item').first().click();
  await win.fill('#rd-s1', '2');
  await win.fill('#rd-s2', '1');
  await win.click('#rd-ok');
  const after = await callWin.waitForFunction((b) => document.getElementById('cs-progress').textContent.trim() !== b, before, { timeout: 5000 }).then(() => true, () => false);
  if (!after) fail('別ウィンドウの呼び出し画面が更新されません（file:// での通知）');
  await callWin.close();
  // PNG 変換（SVG→canvas）が動くか
  const png = await win.evaluate(async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="30"><text x="4" y="20">日本語</text></svg>';
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
    const c = document.createElement('canvas');
    c.width = 80; c.height = 30;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/png').startsWith('data:image/png');
  });
  if (!png) fail('PNG 変換に失敗');
  const saved = await win.evaluate(() => !!localStorage.getItem('bukatsu-taikai:state'));
  if (!saved) fail('自動保存されていません');
  console.log(`OK: 起動・結果入力・呼び出し画面の別ウィンドウ・PNG変換・自動保存（${exe || 'electron .'}）`);
} catch (e) {
  fail(e.message);
} finally {
  await app.close();
}
