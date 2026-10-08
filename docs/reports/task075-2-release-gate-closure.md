# Task075.2 Release Gate Closure

## Final decision

**NO-GO**

Task075.2で管理面を含むProduction監査が可能になり、最新deployment、runtime logs、Production env名、Supabase Auth設定、backup/PITR状態を実際に確認した。その結果、次の明確なP1 blockerを確認した。

1. Vercel Productionにserver-side Supabase keyとStripe関連envが存在しない。
2. Stripe webhook secret / price IDが存在せず、Production subscription / payment webhookを安全に処理できない。
3. Supabase PITRは無効で、CLIが返す利用可能なphysical backupは0件だった。scheduled logical backupの保持期間も確認できない。
4. visual benchmarkはTask075.1の `PASS 3 / WARN 2 / FAIL 5` のままで、合格条件を満たしていない。
5. Decoration、New Photo Placement、Annual、Family、FREE/PLUSのブラウザ変更系E2Eは、Task075.2で新しい隔離fixtureを用意して完走できていない。

未確認や不足をPASS扱いしないというTask075.2の規則に従い、公開判定はNO-GOである。

## Branch

- Task075.1 commit `604ed41c79c81ca87ea6eb118d252cddb03f2020` をfast-forwardでmainへmergeし、`origin/main`へpushした。
- Task075.2 branch: `feature/task075-2-release-gate-closure`
- mainへTask075.2の変更を直接commit / mergeしていない。

## Visual benchmark

Task075.1の隔離fixture結果を再監査した。Task075.2ではProduction blockerを先に検出し、追加の実写真upload / Vision callを発生させる専用fixture再作成は行っていない。評価不能項目をPASSに変更していない。

| 項目 | 判定 | 理由 |
|---|---|---|
| Hero clarity | WARN | coverは表示済みだが独立HERO構成の正式評価なし |
| face / ears crop | PASS | 表紙・2-photoページで致命的欠損なし |
| 1-photo composition | FAIL | 同一fixture Albumに対象構成なし |
| 3-photo composition | FAIL | 同一fixture Albumに対象構成なし |
| 4-photo composition | FAIL | 同一fixture Albumに対象構成なし |
| 5-photo composition | FAIL | 同一fixture Albumに対象構成なし |
| whitespace | PASS | 表紙・2-photoページは読みやすい |
| density rhythm | WARN | 2枚構成のみでAlbum全体評価不可 |
| text/date breathing room | PASS | 明白な衝突なし |
| print readability / emotional coherence | FAIL | 写真なし見開きwarningが残った |

- PASS: 3 / 10
- WARN: 2 / 10
- FAIL: 5 / 10
- release gate `FAIL=0`, `PASS>=8`: **FAIL**

## Browser change E2E

### Decoration

**INCOMPLETE**。Task075.1では recommendation panel と `装飾なし` の安全なfallbackまで確認した。実Decoration候補のpreview / apply / reload / undo / redo / Print反映は未完了。

### New Photo / Smart Placement

**INCOMPLETE**。自動テストではlocal placement、new Draft version、atomic apply、undo/redo、race protectionがPASSしている。隔離browserでuploadからplacement applyまでの一連操作は未完了。

### Annual

**INCOMPLETE**。自動テストではeligibility、partial analysis、fingerprint、materialization protectionがPASSしている。複数月を持つ隔離Annual fixtureでNOW/list/materialize/reload/double-openは未完了。

### Family

**INCOMPLETE in browser**。Task070.1の実DB probeでOWNER/MEMBER/NON_MEMBER/REVOKED_MEMBER、invite/revoke、FAMILY_NEW、Storage境界はPASSしている。Task075.2専用browser fixtureでは未完了。

### FREE / PLUS

**INCOMPLETE in browser**。Task071.1の実DB probeでFREE/PLUS/downgrade/family-owner-plan/Stripe orderingはPASSしている。Task075.2専用browser fixtureでは未完了。さらにProduction Stripe env不足のため、Production entitlement同期は動作不能である。

## Production deployment and health

- Vercel project: `uchinoco`
- latest Production deployment: **Ready**
- canonical aliases include `https://www.uchinoco.app` and `https://uchinoco.app`
- public health probes:
  - `/`: 307 to authenticated entry flow
  - `/login`: 200
  - `/privacy`: 200
  - `/terms`: 200
- Production logs, last 7 days:
  - HTTP 500: 0
  - level error: 0

取得可能な範囲で継続的な500、Auth error、webhook failure、Supabase runtime failureは検出されなかった。ただしStripe webhook env自体が不足しているため、成功実績の証明ではない。

## Production environment

値は取得・記録せず、変数名と存在だけを監査した。

| Variable / setting | Result | Note |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | PRESENT | Production / Preview |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | PRESENT | Production / Preview |
| `NEXT_PUBLIC_SITE_URL` | PRESENT | Production |
| `OPENAI_API_KEY` | PRESENT | Production / Preview |
| `OPENAI_VISION_MODEL` | PRESENT | Production / Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | MISSING | webhook / server admin処理のblocker |
| `STRIPE_SECRET_KEY` | MISSING | checkout/subscriptionのblocker |
| `STRIPE_WEBHOOK_SECRET` | MISSING | webhookはconfiguration 500になる |
| `STRIPE_PLUS_PRICE_ID` | MISSING | PLUS checkoutのblocker |
| `UCHINOCO_INTERNAL_USER_IDS` | MISSING | `/dev`はfail closedになるため本番機能にはNOT_REQUIRED |
| `PRINT_COMMERCE_MODE` | MISSING | code defaultは`disabled`。購入はfail closed |
| `PRINT_PROVIDER` | MISSING | code defaultは`mock`。外部発注なし |
| production provider credential/mode | MISSING | Print公開不可 |

## Auth URL / redirects

Supabase remote configをread-onlyで比較した。

- Site URL: `https://www.uchinoco.app` — **PASS**
- Additional redirect URLs:
  - Production canonical confirm URL — PRESENT
  - Production Vercel alias confirm URL — PRESENT
  - localhost confirm URL — PRESENT
- email confirmation: enabled
- custom SMTP: enabled
- OAuth loginはアプリの現行MVP対象外。OAuth callbackはNOT_REQUIRED。

localhost URLはadditional allowlistにのみ存在し、Productionのdefault Site URLではない。Production signup confirmをlocalhostへ既定redirectする状態ではない。

## Stripe Production audit

- application webhook route: `/api/stripe/webhook`
- code上のrequired event handling:
  - `checkout.session.completed`
  - `checkout.session.expired`
  - `payment_intent.payment_failed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- server-side signature verification、idempotent DB transition、server authorityは実装・テスト済み。
- Vercel Productionのsecret / webhook secret / price ID: **MISSING**
- Stripe Dashboard webhook endpoint、mode、event subscription: **UNVERIFIED**
- success/cancel URLは`NEXT_PUBLIC_SITE_URL`をserver-sideで使う設計だが、実Stripe session作成はenv不足で不可。
- 実paymentは行っていない。

したがってProduction Stripe / PLUS / payment gateはFAIL。

## Supabase backup / PITR / recovery

Supabase CLIのProduction project情報:

- project health: ACTIVE_HEALTHY
- WAL-G: enabled
- PITR available/enabled: **false**
- CLIで列挙されたphysical backups: **0**
- scheduled backup enabled / retention: **UNVERIFIED**
- authorized restore method: CLI/DashboardのPITR restore commandは存在するが、利用可能なrestore pointは確認できない。
- Production restore: 実施していない。

安全な復旧手順を [production-recovery.md](../operations/production-recovery.md) に追加した。migration確認、write freeze判断、staging rehearsal、restore、Auth/RLS/Storage/Stripe整合確認、abort条件を記載した。backup restore drillは利用可能なbackupとstagingがないため未実施。

Backup/PITR gateはFAIL。

## Print decision

- `PRINT_COMMERCE_MODE`未設定時はcode default `disabled`。
- `PRINT_PROVIDER`未設定時はcode default `mock`。
- unresolved provider release gatesがコード上に残り、live providerはfail closed。
- Print Preview / PDFはTask075.1の隔離AlbumでPASS。
- checkout / 実課金 / 実provider注文は実施していない。

Production Print purchaseは **DISABLED**。他のrelease gateが通れば `GO WITH PRINT DISABLED` の対象になり得るが、今回はenv/backup/visual/browser E2Eが未達のためNO-GO。

## Automated verification

- full test suite: **976 passed / 0 failed**
- `npx tsc --noEmit`: **PASS**
- `npm run build`: **PASS**
- `npm run lint`: **PASS, 0 errors / 12 warnings**
- `git diff --check`: **PASS**
- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities**
- `npx supabase migration list`: local / remote一致
- `npx supabase db push --dry-run`: up-to-date、pending 0
- build warning: Apple Siliconでx86-64 Node / Rosetta 2
- test warning: Node module type判定warning。test failureなし

## Remaining blockers

1. Vercel Productionへ正しいserver-side Supabase / Stripe / PLUS設定を登録し、値を出さず再監査する。
2. Stripe DashboardでProduction webhook endpoint、mode、required eventsを確認する。
3. Supabase planでscheduled backup/retentionを確認し、PITRまたは承認済みbackup/recovery方針を有効化する。
4. stagingでrestore drillを実施する。
5. 専用visual fixtureで全構成を目視し、`FAIL=0`, `PASS>=8`を満たす。
6. Decoration、New Photo Placement、Annual、Family、FREE/PLUS browser E2Eを隔離fixtureで完走する。

新しいP0 data-loss/auth bypassは検出していないが、上記P1 gateが残るためProduction一般公開は承認できない。
