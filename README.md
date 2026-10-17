# 部内大会トーナメント

部内大会のトーナメント表・総当たり表を作り、結果入力・順位集計・掲示物の出力までを行うアプリです。
ブラウザ版（GitHub Pages）と Windows 版（`.exe`）があり、どちらも同じ画面・同じ機能です。

## できること

- 参加者名簿からトーナメント表（2〜128人）・総当たり表（2〜40人）を自動作成
- 参加者名・卓名の編集（作成後の名前変更も表に反映）
- 使用する卓の数、シード人数、シード以外の配置（名簿順／抽選）、3位決定戦の有無を指定
- 試合結果（スコア・勝者・不戦勝）を入力すると、勝者が次の回戦へ自動で進む
- 結果を修正すると、矛盾する後続の試合結果を確認のうえ取り消す
- 表の下に試合結果一覧（試合番号・卓・時間帯・スコア・勝者・状態）
- 順位表（トーナメント: 敗退回戦順／総当たり: 勝点→直接対決→得失点差→総得点）
- トーナメント表・総当たり表・試合結果・順位表を CSV / PNG で出力、印刷
- 大会データの自動保存、ファイルへの保存・読込、名簿の CSV 取込（UTF-8 / Shift_JIS）
- 進行状況（終了数、次に行う試合と卓）

## 使い方

1. 「参加者・設定」で参加者を入力（1人ずつ追加、または「一括入力・CSV取込」）。上から順がシード順です
2. 卓の数・卓名、シード人数などを設定し、「トーナメント表を作成」「総当たり表を作成」
3. 「トーナメント」「総当たり」タブで試合（表のマス・試合・一覧の行・「次に行う試合」）をクリックし結果を入力
4. 「順位表」で結果を確認。各表の CSV / PNG ボタンで出力、「印刷」で印刷（A4横）
5. データはブラウザ（Windows 版はPC）に自動保存されます。別のPCへ移す・控えを残すときはヘッダーの「保存」で JSON ファイルに書き出し、「読込」で開きます

## Web 版（GitHub Pages）

`main` ブランチに push すると `.github/workflows/pages.yml` がビルドして公開します。

初回のみリポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にしてください。
公開URL: `https://<ユーザー名>.github.io/<リポジトリ名>/`（このリポジトリなら `https://bibi257.github.io/-/`）

ビルド後の `web/` フォルダは静的ファイルだけなので、`web/index.html` をダブルクリックしてもオフラインで動きます。

## Windows 版（.exe）

### GitHub Actions で作る（推奨）
- `main` への push・PR・手動実行（Actions → Windows build → Run workflow）で `windows-latest` 上でビルドし、
  起動確認（結果入力・PNG変換・自動保存）を行ったうえで、成果物 `bukatsu-taikai-windows` に `.exe` を添付します
- `v1.0.0` のようなタグを push すると、Releases に `.exe` を添付します

### 手元で作る
Node.js 22 以上が必要です。

```sh
npm ci
npm run dist:win     # dist/bukatsu-taikai-<version>-portable.exe ができる
```

Windows でも Linux / macOS でもビルドできます（Linux では Wine 不要で作成できることを確認済み）。
できた `.exe` はインストール不要の単体ファイルで、ダブルクリックで起動します。
コード署名をしていないため、初回起動時に Windows SmartScreen の警告が出ることがあります（「詳細情報」→「実行」）。

## 開発

```sh
npm ci
npm run build        # src/ → web/app.js
npm run serve        # http://localhost:4173/ で確認
npm start            # Electron で起動
npm test             # 単体テスト
npm run test:e2e     # ブラウザ E2E テスト（Playwright）
npm run test:electron  # Electron 版の起動確認
```

構成・ルールは `CLAUDE.md`、計画と設計判断は `PLAN.md`、テスト結果は `TEST_REPORT.md`、残課題は `TODO.md` を参照してください。
