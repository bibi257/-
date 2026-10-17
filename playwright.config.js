import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    viewport: { width: 1300, height: 900 },
    acceptDownloads: true,
    locale: 'ja-JP',
    launchOptions: {
      // ロケール未設定（LANG=C）の Linux では日本語のダウンロード名が "download" になるため UTF-8 を指定
      env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      // 事前インストール済みの Chromium がある環境ではそれを使う
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    },
  },
  webServer: [
    {
      command: 'node scripts/serve.mjs',
      url: 'http://localhost:4173/',
      reuseExistingServer: !process.env.CI,
    },
    {
      // 共有機能のテスト用。画面と共有 API（Worker のコード）を同じオリジンで配信する
      command: 'node scripts/serve.mjs',
      env: { PORT: '4174', WITH_SHARE_API: '1' },
      url: 'http://localhost:4174/api/health',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
