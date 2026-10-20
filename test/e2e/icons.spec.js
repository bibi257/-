import { test, expect } from '@playwright/test';

test('アイコン: タブ用の SVG とホーム画面用の PNG が、ページから読み込める', async ({ page, request }) => {
  await page.goto('/');
  const icon = page.locator('link[rel="icon"]');
  await expect(icon).toHaveAttribute('href', 'favicon.svg');
  const apple = page.locator('link[rel="apple-touch-icon"]');
  await expect(apple).toHaveAttribute('href', 'apple-touch-icon.png');
  const svg = await request.get('/favicon.svg');
  expect(svg.ok()).toBe(true);
  expect(svg.headers()['content-type']).toContain('image/svg+xml');
  const png = await request.get('/apple-touch-icon.png');
  expect(png.ok()).toBe(true);
  expect(png.headers()['content-type']).toContain('image/png');
  // ブラウザがアイコンとして実際に描ける（画像が壊れていない）
  const ok = await page.evaluate(async () => {
    const load = (src) => new Promise((resolve) => { const i = new Image(); i.onload = () => resolve([i.naturalWidth, i.naturalHeight]); i.onerror = () => resolve(null); i.src = src; });
    return { svg: await load('favicon.svg'), png: await load('apple-touch-icon.png') };
  });
  expect(ok.svg).not.toBeNull();
  expect(ok.png).toEqual([180, 180]);
});
