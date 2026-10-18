# Vercel Log Automation — Step 4 Auto Deploy Detection レポート

## 1. 概要

Git push後にVercel Git Integration経由で自動デプロイされたUCHINOCO Production deploymentを、手動デプロイや環境変更を行うことなく**完全読み取り専用（read-only）**で検出し、Ready状態になるまで安全にポーリング監視するスクリプトおよびテストを実装しました。

## 2. 実装ファイル

- **実行スクリプト**: [scripts/wait-vercel-production.mjs](scripts/wait-vercel-production.mjs)
- **テスト**: [tests/wait-vercel-production.test.mjs](tests/wait-vercel-production.test.mjs)
- **npmスクリプト登録**: [package.json](package.json)
  - `vercel:wait-production`: `node scripts/wait-vercel-production.mjs`

## 3. 主な機能と仕様

1. **Vercel CLI呼び出し**:
   - `npx --yes vercel@latest list uchinoco --environment production --limit 20 --json --non-interactive` によるread-onlyデプロイ一覧取得。
   - global installを前提とせず、直接の変更・デプロイコマンド（`deploy`, `--prod`, `promote`, `redeploy`, `rollback`, `link`, `env`変更）は一切使用しません。
2. **対象Deploymentの特定**:
   - `git rev-parse HEAD` および `git branch --show-current` から現在のコミットSHAとブランチを自動取得。
   - CLI引数 `--commit <sha>`, `--branch <branch>` で明示指定可能（短縮SHAのプレフィックス一致にも対応）。
   - `target === "production"` のみを厳格に抽出し、Previewデプロイを確実に除外。
3. **有界ポーリング（Bounded Polling）**:
   - `BUILDING` / `QUEUED` / `INITIALIZING` 状態の間、設定間隔（デフォルト10秒、`--interval`で指定可能）でポーリング。
   - 最大タイムアウト（デフォルト15分＝900秒、`--timeout`で指定可能）を厳格に順守し、無限ループを禁止。
4. **Ready / Errorハンドリング**:
   - `READY`: デプロイURL、コミットSHA、ステータスを表示して正常終了（exit code 0）。
   - `ERROR` / `CANCELED`: エラー表示し、read-onlyの `vercel inspect <url> --logs` を取得して原因を出力、異常終了（exit code 1）。
   - タイムアウト: 経過時間と失敗メッセージを出力して異常終了（exit code 1）。
5. **セキュリティと秘匿情報保護**:
   - `redactText` により、トークン、パスワード、Cookie、認証キー、ユーザー/ペット/写真IDなどの機密情報を自動マスキング。
6. **Step 3 (Album Logs) との接続**:
   - `--logs` フラグ指定時のみ、Ready完了後に `npm run vercel:album-logs` をチェーン実行。

## 4. 検証結果

- **単体テスト**: `node --test tests/wait-vercel-production.test.mjs`
  - 12件全件パス (Ready, Building→Ready, Error時のログ表示と秘匿化, タイムアウト, ブランチ/コミット除外, Preview除外, Durationパース等)。
- **全リポジトリテスト**: `node --test tests/*.test.mjs`
  - 1,083件全件パス (0 fail)。
- **型チェック**: `npx tsc --noEmit`
  - エラー 0 件。
- **リント**: `npm run lint`
  - エラー 0 件 (新規追加ファイルにおける警告 0 件)。
- **空白チェック**: `git diff --check`
  - エラー 0 件。
- **実環境実行確認 (Read-only)**:
  - `npm run vercel:wait-production`: 現在のHEAD commit (`996e84c...`) に紐づくProduction deployment (`https://preview.example.test`) を即時検出・Ready判定を確認。
  - `npm run vercel:wait-production -- --logs`: Ready検出後に `npm run vercel:album-logs` のチェーン起動が正常に動作することを確認。
  - `--commit 0000000 --timeout 1s`: 存在しないコミットでのタイムアウト終了（exit code 1）を確認。
