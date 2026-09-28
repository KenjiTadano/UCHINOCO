# UCHINOCO

家族のペット写真からフォトブックを作る Web アプリです。写真のアップロード、AI 下書き、編集、印刷プレビュー、Stripe Checkout（test mode）までを一つの流れで扱います。

## 動作環境

- Node.js 20.9 以上。監査に使った版は Node.js 22.23.2
- Next.js 16.3.5（`npm run build` は webpack）

## セットアップ

```bash
npm install
cp .env.example .env.local
npm run dev
```

開発サーバーの既定ポートは 3000 です。別ポート（例: `npm run dev -- --port 3001`）で起動した場合、Checkout の success / cancel は、その loopback の Host に戻ります。本番では `NEXT_PUBLIC_SITE_URL` だけを使い、リクエストの Host や Origin は使いません。

## コマンド

```bash
npm run dev
npm run build
npm start
node --test tests/*.mjs
```

## 環境変数

値は `.env.local` に置き、リポジトリには入れません。名前は `.env.example` が正です。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`（サーバーのみ）
- `OPENAI_API_KEY`
- `OPENAI_VISION_MODEL`
- `STRIPE_SECRET_KEY`（サーバーのみ。ローカルは test key）
- `STRIPE_WEBHOOK_SECRET`（サーバーのみ）

欠けた秘密鍵は、決済・解析・管理クライアントが処理を始めない方向で失敗します。

## Supabase

マイグレーションは `supabase/migrations` にあります。remote へ適用する前に `supabase db push` の dry-run を確認します。適用済みファイルは書き換えません。

`supabase db reset` は Docker が使える環境で実行します。Docker がない環境では未検証です。remote の migration 一覧と混同しないでください。

## Stripe

ローカル確認は Stripe test mode だけを使います。本番の課金キーは使いません。Checkout の完了は webhook（`checkout.session.completed`）だけが注文を paid にします。success URL を開いただけでは paid になりません。

開発中の webhook 転送例:

```bash
stripe listen --events checkout.session.completed --forward-to http://127.0.0.1:3000/api/stripe/webhook
```

ポートを変えた場合は forward 先も合わせます。
