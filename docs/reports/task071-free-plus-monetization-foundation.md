# Task071 — FREE / PLUS Monetization Foundation

## 概要

UCHINOCOの課金境界を、クライアント表示ではなくサーバーとDBで強制できる基盤として実装した。FREEは「今の思い出を残す」主要体験とPrintを維持し、PLUSは長期履歴、詳細検索、複数ペット、家族共有、年間アルバム、再生成を提供する。既存データを削除・非表示にするdowngrade処理は追加していない。

## Plan model

- `FREE` / `PLUS` の2プランを中央定義した。
- Stripe subscription statusのうち `active` / `trialing` のみPLUSとして扱う。
- `past_due` / `canceled` / `unpaid` / `incomplete` / `incomplete_expired` / `paused` / rowなしはFREEとして扱う。
- `user_subscriptions` は本人が参照できるが、authenticated clientから書き込めない。
- plan同期は署名検証済みStripe webhookからservice-role限定RPCを呼ぶ。Checkout成功URL、query parameter、localStorageはplan判定に使用しない。
- `UCHINOCO_DEV_PLAN_OVERRIDE` はdevelopment/test専用で、productionでは無視する。

## FREE / PLUS entitlement

中央pure function `getUserEntitlements(plan)` とserver loaderを追加した。

FREEで維持:

- 写真追加
- Photo Intelligence
- UCHINOCO NOW
- AI Albumの新規作成・編集
- Print Preview / Checkout / Order
- 基本キーワード検索、お気に入り検索
- 現在・最近の思い出

PLUS:

- Family Sharingの新規招待・member書込
- 複数ペットの新規追加
- 年・月・季節・日付範囲・記念日・Story・Best Shotの詳細検索
- Year in Review
- 長期On This Day / 成長比較
- Album再生成
- 長期album preservation entitlement
- ad-free

## Print handling

`canPrint` は両プランで常にtrue。既存Print、Checkout、Order処理にsubscription gateは追加していない。Print CTAをPLUS案内で置換していない。

## Family / multi-pet

- Familyはpet ownerのplanを基準とし、招待member側のplanや追加課金を要求しない。
- ownerがPLUSの間だけ新規invite、accept、memberによる写真/thumbnail/analysis書込を許可する。
- downgrade後も既存membership、写真、attributionは残り、ownerとmemberの既存read境界は保持する。新規招待とmember書込のみread-only化する。
- owner自身はFREEでも自分のpetへ写真を追加・管理できる。
- FREEは最初の1匹を作成でき、2匹目以降の新規作成をServer Actionとpets INSERT RLSの両方で拒否する。既存の複数petは削除・非表示にしない。

## Search / history

- FREEはキーワード、AI metadata word、pet、お気に入りによる基本検索を継続できる。
- PLUSの詳細条件はserver entitlement確認後だけDB queryへ渡す。
- FREEがURL queryを直接偽装しても、年、月、季節、日付範囲、Best Shot、記念日、Story条件をserverで除去する。
- Year in Reviewの生成/materialize、長期On This Dayとgrowth history、Album regenerateはServer ActionまたはServer Componentでも再検証する。
- 既にmaterialize済みのalbumをdowngradeで削除・書換えする処理はない。

## Stripe integration

- PLUS用subscription Checkoutを追加し、server-only `STRIPE_PLUS_PRICE_ID` を使用する。
- `checkout.session.completed` のsubscription session、および `customer.subscription.created/updated/deleted` を処理する。
- webhook payloadの `subscription.metadata.user_id` をUUID検証し、statusをDB RPC内でも検証する。
- Stripe event created timestampにより古いeventが新しい状態を上書きしない。
- Checkout成功画面は確認中表示に留まり、webhook同期前にPLUS扱いしない。

## Ads boundary

実広告SDKは追加していない。FREEで広告表示候補にできるsurfaceは `home`、`album-list`、`search-list` のみ。Viewer、Editor、Anniversary、Print Preview、Checkout、Order、Memorialは禁止。PLUSは全surfaceで広告対象外。

## Migration

- 追加: `20261007140000_free_plus_entitlements.sql`
- 内容: subscription source、RLS/DB entitlement helpers、pet/family/photo/analysis/Storage write境界、Stripe同期RPC。
- remote適用は未実施。
- `npx supabase db push --dry-run` でこのmigration 1本だけが対象であることを確認した。
- remote適用後にDatabase型を再生成する必要がある。

## Tests / verification

- `node --experimental-strip-types --test tests/*.test.mjs`: **948 passed / 0 failed**
- `npx tsc --noEmit`: **passed**
- Task071変更範囲lint: **passed**
- `npm run build`: **passed** (Next.js 16.3.5 / webpack)
- `git diff --check`: **passed**
- Supabase dry-run: **passed**, pendingはTask071 migrationのみ
- 全体 `npm run lint`: **既存Task071外のlint errorによりfailed**。Task071対象ファイルにはerrorなし。主な既存箇所はsmart-crop dev UI、cover edit hook、page polish controls、album generating screen、Supabase CLI一時生成物。
- build時にApple Silicon上のRosetta 2警告あり。成果物生成には影響なし。

## Remaining issues

- Stripe Product/Price、Webhook endpointと対象event、`STRIPE_PLUS_PRICE_ID` の本番設定が必要。
- Subscription cancel/manage用Customer Portal UIは今回未実装。
- Migration適用後の実DBで、FREE/PLUS、family downgrade、Storage write、Stripe event順序の2-account E2E確認が必要。
- 長期album preservationはentitlementのみで、自動削除やretention jobは実装していない。
- 広告はeligibility境界のみで、広告配信は未実装。
- billing analytics eventは今回追加していない。

## Git

commit / pushは実施していない。
