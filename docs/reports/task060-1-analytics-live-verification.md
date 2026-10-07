# Task060.1 Analytics Migration & Live Verification

実施日: 2026-10-02
判定: **Remote schema / RLS / RPC verification PASS。Authenticated browser event flowは未確認。**

## Migration Result

- Pre-check `npx supabase migration list`: `20261002120000_album_analytics_events.sql`だけがlocal未適用、remote appliedなし。
- Pre-check `npx supabase db push --dry-run`: 適用候補は同migration 1件のみ。seeds / roles なし。
- `npx supabase db push`: 成功。適用されたのは`20261002120000_album_analytics_events.sql`のみ。
- Post-check migration list: local / remoteとも`20261002120000` applied。
- Post-check dry-run: `Remote database is up to date`、migrations 0件。
- analytics以外のmigration適用はなし。

## Generated Types

- `npx supabase gen types typescript --linked --schema public > lib/supabase/database.types.ts`で再生成。
- 生成出力に`album_analytics_events` tableと`get_album_analytics_summary()` RPCを確認。手書きでgenerated typeへ追加していない。
- GeneratorがPostgres RPC argsをnon-nullで出力する一方、既存SQLはreset/delete時にNULL引数を意味値として使うため、該当RPC call siteのみ型境界castを追加。`timeline_at`のnullable生成型は`created_at` fallbackで処理。

## RLS / Append-only

Linked remoteで、既存non-ordered active draftを使った`BEGIN ... SET LOCAL ROLE authenticated ... ROLLBACK` probeを実施。JWT subject claimをtransaction内で切り替えたdatabase-role policy testであり、実browser JWT/session testとは区別する。

- owner: SELECT 1件、INSERT成功。
- 別user: 同じeventのSELECT 0件、INSERTはRLS deny。
- ownerが同ownerの別album draft IDを指定したINSERT: RLS deny。
- authenticatedのtable privilege: SELECT=true、INSERT=true、UPDATE=false、DELETE=false。
- probe transactionはrollback。probe eventがremoteへ残っていないことを確認。

## Event Wiring / Duplicate Protection

Code call sites:

- `album_generated`: album generation action。
- `album_viewed`: complete / preview route。
- `album_edit_started`: page editor route。
- `print_preview_opened`: print preview route。
- `album_accepted`: authenticated accept action。
- `checkout_started`: checkout-start action。provider checkout/paymentは実行していない。
- `decoration_recommendation_shown` / `decoration_previewed` / `decoration_applied` / `decoration_reset`: Task059 editor。

Remote rollback probeでは`album_generated`、`album_viewed`、`album_edit_started`、`album_accepted`、`print_preview_opened`、recommendation shown/appliedをauthenticated roleでINSERT成功。実ユーザー画面操作からのINSERTはbrowserが未認証のため未確認。

Reload dedupe keyはview/edit/printでdraft version由来の固定key、decorationでspread/action由来の固定key。remote transactionで同一event key再INSERTがunique violationとなり、row count 1のままを確認。server writerは`23505`を成功相当として返し、analytics errorはproduct navigationを妨げない。

## Edit Distance

- Metrics unit tests: no-op Acceptは`DIRECT_ACCEPT` / `NONE`、軽微crop editは`LIGHT_EDIT_ACCEPT`。
- Live summary probeではsynthetic rollback event dataとしてdirect accept（edit distance 0）を確認。実safe draftをAcceptするBrowser操作は未実施。

## Summary RPC

Linked remote `get_album_analytics_summary()`をauthenticated contextで実行。

空データ時は全項目を0で返す。rollback-only metric fixtureでは以下を確認:

- generated albums 1
- direct accept rate 1、any accept rate 1
- average edit distance 0、average time to accept 12秒
- layout #1 keep rate 1、crop keep rate 1
- decoration accept rate 1、print preview rate 1
- checkout start rate 0、regenerate rate 0

fixture eventは全てrollback済み。

## Privacy

- `event_data` key scanでcaption/text/free_text/signed_url/storage_path/token/cookie/promptの該当行0件。
- rollback probe payloadはevent種別・aggregate値・style ID/sourceのみ。captionやfree text本文、Storage path、signed URL、token/cookie、AI promptを含めない。
- probe eventの永続行0件。

## Browser Verification

- 共有localhostは`/login`表示で未認証。Home→Album listなどのauthenticated UI操作は未実施。
- 実safe draftのpage reload、actual event event insert、accept timing/real edit-distanceをbrowserからは確認していない。
- Provider注文/課金は実施していない。

## Regression / Completion

- `node --experimental-strip-types --test tests/*.test.mjs`: PASS（811 / 811）
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS
- 変更範囲lint: PASS
- `git diff --check`: PASS
- RLS / event / dedupe / summary / privacy remote probes: PASS（rollback transaction）
- commit / push: 未実施

Known issue: Authenticated browser event-flow verification is pending; the shared browser session remains at `/login`. No analytics probe data remains in the remote database.
