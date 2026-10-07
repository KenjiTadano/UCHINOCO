# Task071.1 — Remote Monetization Verification

## 結果

Task071 migrationをremote Supabaseへ適用し、local/remote migration履歴一致、pending 0、型再生成、実DB RLS/RPC/Storageプローブを完了した。検証fixtureは専用Auth userとデータを一時作成し、終了時にAuth cascadeとStorage cleanupで削除した。実課金・実注文は行っていない。

## Migration

- 適用: `20261007140000_free_plus_entitlements.sql`
- pre-check: Task071の1本だけpending
- apply: success
- post-check: local/remote一致
- `supabase db push --dry-run`: up to date / pending 0
- `lib/supabase/database.types.ts`: remote public schemaから再生成済み

## FREE boundary

実DBで確認:

- 1匹目pet作成: PASS
- 2匹目pet作成: RLS deny
- owner自身の写真追加: PASS
- 通常album row作成: PASS
- 所有petの基本写真検索: PASS
- Family invite: RPC deny
- clientからsubscription rowを書き換えるplan偽装: deny

Server境界・回帰テストで確認:

- 高度な検索条件はFREE時にserverで除去
- Annual materializeと長期historyはFREE時に拒否
- Print Preview / Checkout / Orderにsubscription gateなし

## PLUS boundary

署名済みWebhookと同じservice-role限定RPCで`active`状態を作り、実DBで確認:

- 2匹目pet作成: PASS
- Family invite / accept: PASS
- plan rowを持たないFREE memberの参加: PASS
- member photo write: PASS
- member private Storage upload / signed read: PASS

advanced search、Year in Review、On This Day、regenerateは、remote subscription rowを読む共通server entitlementとTask071テストで境界を確認した。これらは専用DB write policyではなくServer Component / Server Action境界で制御する。

## Downgrade

ownerを`past_due`へ遷移して確認:

- owner pets 2件: 保持
- owner/member photos: 保持
- album: 保持
- family membership: 保持
- memberによる既存family photo read: 維持
- memberの新規photo write: deny
- memberの新規Storage upload: deny
- ownerの追加pet作成: deny
- ownerの新規Family invite: deny
- 既存Storage objectのsigned read: 維持

Migrationにphotos、pets、albums、family membership、orders、print snapshotを削除・変更する処理はない。注文データを作る実決済probeは行っていない。

## Stripe ordering / source of truth

service-role限定同期RPCで確認:

- `active` → PLUS
- `trialing` → PLUS
- `past_due` → FREE
- `unpaid` → FREE
- `canceled` → FREE
- 古いevent timestampによる新状態の上書き: 防止
- authenticated clientによるplan/status変更: deny
- Checkout success query / URLだけによるDB変更経路: なし

なお最初のprobeでは、検証script内でservice-role clientへuser sessionを設定してしまいadmin RPCが`42501`になった。product codeの問題ではなくfixtureのclient分離不足で、admin clientとuser sign-in clientを分離して再実行し全項目PASSとなった。

## Storage / Family

- owner PLUS: accepted memberの`pet-photos` INSERTとsigned readを確認
- owner FREEへdowngrade後: member INSERT deny、既存object signed read維持
- member本人のplanは参照条件に含めず、owner planのみでwrite entitlementを決定
- public URL、service keyのclient露出、RLS bypassは使用していない

## Print protection

既存Print Preview、Checkout action、Order routeを再監査し、`loadUserEntitlements` / `canPrint`による拒否がないことを確認した。FREEでもentry可能。実Stripe Checkout session作成・注文・課金は実行していない。

## Regression / verification

- Full suite: **948 passed / 0 failed**
- `npx tsc --noEmit`: **PASS**
- `npm run build`: **PASS**
- Task071 scoped lint: **PASS**
- `git diff --check`: **PASS**
- Remote entitlement probe: **全18項目PASS**
- Build warning: Apple Silicon上のRosetta 2警告のみ
- 全体lintの既存errorはTask071範囲外であり、Task071 scoped lintにはerrorなし

## Remaining issues

- Stripe本番Webhook eventの実送信と本番PriceによるE2Eは、課金禁止のため未実施。
- Customer Portal / cancel UXはTask071の残課題。
- advanced search / Annual / regenerateはServer境界であり、DB単体RPCとしてのdenyではない。Server Action/Componentとテストで保護している。
- 実注文を作るPrint E2Eは未実施。subscription gateが存在しないことまで確認した。

## Git

commit / pushは実施していない。
