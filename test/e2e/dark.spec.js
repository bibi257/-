import { test, expect } from '@playwright/test';
import { inflateSync } from 'node:zlib';
import { open, importNames, enterScore, download, genTournament } from './helpers.js';

const NAMES = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎'];
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };

/** PNG の左上の画素（RGB）。1行目の1画素目は、どのフィルタでも生の値 */
function firstPixel(png) {
  const colorType = png[25];
  const idat = [];
  for (let i = 8; i < png.length;) {
    const len = png.readUInt32BE(i);
    if (png.toString('latin1', i + 4, i + 8) === 'IDAT') idat.push(png.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  return [...raw.subarray(1, 1 + bpp)];
}

async function startTournament(page) {
  await open(page);
  await importNames(page, NAMES);
  await genTournament(page);
}

test.describe('ダークモード（端末の設定がダーク）', () => {
  test.use({ colorScheme: 'dark', viewport: { width: 1280, height: 800 } });

  test('背景・カード・文字・罫線が計画書の色になり、ネイティブの部品もダークになる', async ({ page }) => {
    await open(page);
    const css = (sel, prop) => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el)[p], prop);
    expect(await css('body', 'backgroundColor')).toBe(rgb('#0f1724'));
    expect(await css('#panel-setup .card', 'backgroundColor')).toBe(rgb('#172234'));
    expect(await css('#panel-setup .card', 'borderTopColor')).toBe(rgb('#2b3a50'));
    expect(await css('body', 'color')).toBe(rgb('#e6ebf2'));
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark');
    // ヘッダーは濃い面のまま、ボタンの文字は白
    expect(await css('.app-header', 'backgroundColor')).toBe(rgb('#0a101b'));
  });

  test('トーナメント表の SVG（画面）はダークの色になる。勝者の枠・勝ち上がり線は青（ダーク用の青）', async ({ page }) => {
    await startTournament(page);
    await page.locator('#panel-tournament .next-item').first().click();
    await enterScore(page, 2, 1);
    const fill = (sel) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).fill);
    expect(await fill('#bracket-wrap svg > rect')).toBe(rgb('#172234')); // 背景はカードの色
    expect(await page.locator('#bracket-wrap svg text').first().evaluate((el) => getComputedStyle(el).fill)).toBe(rgb('#e6ebf2')); // タイトルの文字
    const winnerStroke = await page.locator('#bracket-wrap svg rect[stroke="#1d5fbf"]').first().evaluate((el) => getComputedStyle(el).stroke);
    expect(winnerStroke).toBe(rgb('#6aa6f5'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('印刷は白背景のまま（ダークでも変えない）', async ({ page }) => {
    await startTournament(page);
    await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(255, 255, 255)');
    expect(await page.locator('#bracket-wrap svg > rect').first().evaluate((el) => getComputedStyle(el).fill)).toBe('rgb(255, 255, 255)');
    expect(await page.locator('#bracket-wrap svg text').first().evaluate((el) => getComputedStyle(el).fill)).toBe(rgb('#1c2530')); // 文字は今までの濃い色
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper').trim())).toBe('#ffffff');
  });

  test('PNG 出力は白背景のまま（ダークでも変えない）', async ({ page }) => {
    await startTournament(page);
    await page.click('#panel-tournament [data-export-toggle]');
    const png = await download(page, '#panel-tournament [data-export=bracket-png]');
    expect(firstPixel(png.bytes).slice(0, 3)).toEqual([255, 255, 255]);
  });

  test('結果入力のダイアログ・呼び出し画面・総当たり・順位表もダークの背景', async ({ page }) => {
    await startTournament(page);
    await page.locator('#panel-tournament .next-item').first().click();
    expect(await page.locator('#result-dialog').evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgb(255, 255, 255)');
    await page.click('#rd-cancel');
    await page.click('[data-call=tournament]');
    expect(await page.locator('#call-screen').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(rgb('#0f1724'));
    await page.keyboard.press('Escape');
    for (const tab of ['standings']) {
      await page.click(`.tabs [data-tab=${tab}]`);
      expect(await page.locator(`#panel-${tab} .card`).first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(rgb('#172234'));
    }
  });
});

test.describe('ライトのまま（端末の設定がライト）', () => {
  test.use({ colorScheme: 'light', viewport: { width: 1280, height: 800 } });

  test('今までの色のまま。SVG も白背景', async ({ page }) => {
    await startTournament(page);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(rgb('#eef1f5'));
    expect(await page.locator('#panel-tournament .card').first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
    expect(await page.locator('#bracket-wrap svg > rect').first().evaluate((el) => getComputedStyle(el).fill)).toBe('rgb(255, 255, 255)');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
  });
});

const DIALOGS = ['result-dialog', 'import-dialog', 'pairing-dialog', 'choice-dialog', 'share-dialog', 'qr-dialog'];
const dialogCss = (page, id, prop) => page.evaluate(([i, p]) => {
  const d = document.getElementById(i);
  d.showModal();
  const v = getComputedStyle(d)[p];
  d.close();
  return v;
}, [id, prop]);

for (const [scheme, paper, text] of [['dark', '#172234', '#e6ebf2'], ['light', '#ffffff', null]]) {
  test.describe(`ダイアログの背景・文字（${scheme}。N10）`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 1280, height: 800 } });

    test('結果入力・取込・組み合わせ・共有・QRコードなどのダイアログは、ページのカードと同じ背景・文字の色', async ({ page }) => {
      await open(page);
      const card = await page.locator('#panel-setup .card').first().evaluate((el) => getComputedStyle(el).backgroundColor);
      const body = await page.evaluate(() => getComputedStyle(document.body).color);
      if (scheme === 'dark') expect(card).toBe(rgb(paper));
      for (const id of DIALOGS) {
        expect(await dialogCss(page, id, 'backgroundColor'), `${id} の背景`).toBe(card);
        expect(await dialogCss(page, id, 'color'), `${id} の文字`).toBe(text ? rgb(text) : body);
      }
    });

    test('ダイアログの中の入力欄・ボタンの色は、ページの中のものと同じ', async ({ page }) => {
      await open(page);
      const pageField = await page.locator('#panel-setup input:not([type=checkbox]):not([type=radio])').first().evaluate((el) => {
        const c = getComputedStyle(el);
        return [c.backgroundColor, c.color];
      });
      const pageBtn = await page.locator('#panel-setup button:not(.primary):not(.danger)').first().evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).borderTopColor]);
      await page.click('.h2-actions [data-act=import]');
      const f = await page.locator('#im-text').evaluate((el) => { const c = getComputedStyle(el); return [c.backgroundColor, c.color]; });
      expect(f).toEqual(pageField);
      const b = await page.locator('#im-file-btn').evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).borderTopColor]);
      expect(b).toEqual(pageBtn);
    });

    test('QRコードの画像部分は白地のまま・呼び出し画面は今の配色（ページの背景色）のまま', async ({ page }) => {
      await open(page);
      expect(await page.evaluate(() => getComputedStyle(document.getElementById('qr-img')).backgroundColor)).toBe('rgb(255, 255, 255)');
      const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(await dialogCss(page, 'call-screen', 'backgroundColor')).toBe(canvas);
    });
  });
}
