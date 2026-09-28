# Task066 Release Readiness Report

監査日: 2026-09-28  
対象: Task001〜065 の主要フロー。新機能追加なし。commit / push なし。

判定: **BLOCKER 0 / HIGH 0**。Stripe test mode で Checkout → Webhook → paid → album ordered → print job 1件を実ブラウザと実DBで確認した。

## 修正

`GET /api/photo-analysis` が毎画面 503 になっていた。

原因は解析キューの PostgREST フィルタ。`or()` の中にカンマ区切りの `error_code.not.in.(...)` があり、さらに `photos` と `pets` の関係が複数あるため embed も曖昧だった。クエリが必ず失敗し、ルートが 503 を返していた。開発環境だけのログ汚れではなく、ログイン中の主要画面でキュー取得が止まっていた。

対応:

- 候補取得は `pending / failed / processing` の単純な `or()` と `attempts < 3` に限定
- 再試行・期限切れ・終端エラーの判定は `canClaimAnalysis` に戻した
- pet の embed は `pets!photos_pet_id_fkey` に固定
- キュー取得失敗時は 503 ではなく `{ ready: false, stopped: true, waitMs: 0 }`

確認: ログイン状態の `GET /api/photo-analysis` は 200。空キューは `ready: false, waitMs: 0`。未ログインは 401。UI の無限スピナーにはなっていない。

## Stripe test mode

本番キーではない（`sk_test_`）。`stripe listen` の署名はローカルの webhook secret と一致した。カード番号は記録していない。

対象アルバム: AI Draft Lab 2023-07（`ffa361ca-bb60-4949-af65-e2f0448dfa08`）  
注文: `2216f157-a744-48d2-b617-853fdbd6afae`

| 項目 | 結果 |
| --- | --- |
| Checkout | Stripe の test Checkout（`cs_test_`、表示名 UCHINOCOサンドボックス） |
| 金額 | スタンダード 20ページ ¥2,980 + 送料 ¥550 = ¥3,530 |
| Webhook | `checkout.session.completed` → アプリが 200 |
| order.status | paid |
| album.status | ordered |
| print snapshot | 注文の snapshot id と fingerprint が Finalize 済み snapshot と一致 |
| order_photos | 4件（snapshot からのコピー） |
| print job | 1件、status queued、idempotency key `print-order:{orderId}` |
| 再送 | 同じ event を再送し、アプリは再び 200。job は 1件のまま、order_photos は 4件のまま |

このアルバムは注文済みになり、ページ編集は「注文済みのため編集できません」になった。写真実体は削除していない。guard 確認のため注文は残している。

Stripe の success redirect は `NEXT_PUBLIC_SITE_URL`（localhost:3000）へ戻った。監査で使った dev server は 3001 のため、ブラウザはアプリに戻らず `chrome-error` になった。注文ページを 3001 で直接開くと「注文完了（制作中）」だった。paid 化は webhook のみ。

## Release checklist

| 領域 | 判定 | メモ |
| --- | --- | --- |
| Auth | PASS | 未ログインの編集 URL は 307 で `/login`。解析 API は 401 |
| Storage | PASS | `pet-photos` / `pet-photo-thumbnails` / `pet-avatars` / `print-files` の public URL は匿名 400 |
| AI | PASS | 503 を停止。空キューは 200 でポーリング停止 |
| Draft | PASS | 既存 2023-07 draft の文言が編集と印刷プレビューで一致 |
| Editor | PASS | 支払い前は編集可。paid 後は readonly |
| Print | PASS | 表紙と見開きの保存文言を表示。PDF は 4ページで開ける |
| Checkout | PASS | サーバー価格 ¥3,530。snapshot 付きで Stripe test Checkout へ遷移 |
| Webhook | PASS | 署名付き event のみ。200。再送で重複なし |
| Paid | PASS | order paid、album ordered |
| Print Job | PASS | 1件、`print-order:{orderId}` |
| Migration | PASS | local と remote が 31件で一致。対象6件を含む |
| Env | WARN | 必須名は `.env.example` にある。README は create-next-app のままで env / Node を書いていない。ローカル site URL は port 3000 |
| Build | PASS | `npx tsc --noEmit`、`npm run build`、テスト 672、`git diff --check` |

db reset: Docker が使えないため **environment-unverified**。remote linked DB の migration 一致とは別に記録する。

## 監査メモ

- Service role は `lib/supabase/admin.ts`（server-only）と、checkout / webhook / print のサーバー側だけ。client bundle（`.next/static`）に service role、Stripe secret、OpenAI key の名前は出ていない。`.env.local` は gitignore。値は記録していない。
- 未ログイン protected route は login へ戻る。他人リソースの live な User B 操作は今回のブラウザセッションではやり直していない。cross-owner / success URL / ordered editor / replay / print job 重複は既存テストと今回の実注文で確認した。
- 印刷プレビューは警告（白紙ページ、装飾の重なり、1枚見開き）のみ。注文ボタンは有効だった。
- PDF `docs/print-064-book.pdf` は開ける。4ページ、約 19MB。
- `npm audit` は high/critical を含め 0。upgrade はしていない。
- Node v22.23.2、Next.js 16.3.5。
- 冷たい印刷プレビューは約 3.5〜6s、温まると約 0.4s。ページ編集は約 3.2s。小さなアルバムでは極端な失敗には見えなかった。

## 発見

| 深刻度 | 内容 |
| --- | --- |
| BLOCKER | なし（503 は修正済み） |
| HIGH | なし |
| MEDIUM | ローカル `NEXT_PUBLIC_SITE_URL` が port 3000。3001 で動かしていると Stripe の戻り先がアプリに届かない。paid 自体は webhook で完了する |
| LOW | Checkout 画面で Next.js の hydration overlay が `OrderFlowHeader` を指した。決済操作は完了した |
| INFO | README が必須 env と Node を列挙していない。正は `.env.example` |
| INFO | `supabase db reset` は Docker 不使用のため未実施 |
| INFO | AI Draft Lab 2023-07 は今回の test 決済で ordered。削除していない |

## 証拠

- `docs/release-066-editor.png`
- `docs/release-066-print.png`
- `docs/release-066-order.png`
- `docs/release-066-paid.png`

カード番号、秘密鍵、配送先の実入力は写していない。注文確認の住所欄はプレースホルダのまま。

## docs の残置

削除はしていない。

残すもの: `docs/task*.md`、`docs/release-066-*.png`、`docs/print-064-book.pdf`、デザイン比較の基準画像。  
検証の一時物: `docs/*-ui-compare/`、`docs/*-verify.png`、各タスクの途中スクリーンショット。commit 時に分ける候補。秘密は含めていない。

## 検証コマンド

- `npx tsc --noEmit` 終了 0
- `npm run build` 終了 0（Next.js 16.3.5 webpack）
- `node --test tests/*.mjs` 672 pass / 0 fail
- `git diff --check` 終了 0
- `npm audit` 脆弱性 0
- migration list: local と remote が一致（`20260928100000` から `20260928220000` を含む）
- 適用済み migration ファイルの git diff は空。新規 SQL は未追跡の追加のみ
