# Task063.2 Remote Migration & Live Verification

実施日: 2026-10-04
判定: **Remote RPC / idempotency / rollback PASS。Browser E2E未完了。**

## Migration Result

- Apply前 `npx supabase migration list`: `20261004120000_atomic_passive_album_materialization.sql`だけがlocal未適用。
- Apply前 `npx supabase db push --dry-run`: 同migration 1件のみ。seeds/rolesなし。
- `npx supabase db push`: 成功。対象migrationだけをlinked remoteへ適用。
- Apply後 `migration list`: local / remoteとも`20261004120000`。
- Apply後 `db push --dry-run`: remote up-to-date、pending migration 0件。
- `lib/supabase/database.types.ts`は`npx supabase gen types typescript --linked --schema public`で再生成。materialization RPCがgenerated typesに含まれることを確認。生成型は手編集していない。
- 生成型が既存RPCのnullable SQL argsをnon-nullと記述したため、該当既存RPC call-siteのみboundary castを追加。`photos.timeline_at` nullableは`created_at` fallbackで処理。

## RPC Result

既存non-ordered safe petの既存12写真と候補期間を使い、全検証をauthenticated role/JWT claim下のrollback-only transactionで実行した。画像・Storage pathは取得せず、album/draft/analytics行はrollback後に残っていない。

- **Owner success:** deterministic fingerprint由来album IDで`reused=false`。
- **Deterministic ID:** SQL migrationと同じSHA-256/UUID導出IDを渡し、RPCの返却album IDと一致。
- **Other user:** 別user claimではowner petに対して`not found`でdeny。
- **Stale photo set:** 実際の期間写真12件に別UUIDを足したsetは`stale candidate`でdeny。
- **Wrong pet:** 所有していないUUIDは`not found`でdeny。
- **Idempotency:** 同fingerprintを同transaction内で2回呼び、1回目create、2回目`reused=true`。album 1、active Draft 1、selected photo 1/unique photo 1、cover 1、`album_generated` analytics 1をassert。
- **Protected existing state:** 同期間に一時blockerを作り、ready / ordered album、active editing Draft、`album_accepted` event各々で`existing album is protected`をassert。blockerはtransaction rollbackで残していない。

## Atomic Rollback

管理接続はSupabase linked CLIのSQL queryで利用できた。authenticated claimと`uchinoco.test_materialize_failure_stage`をtransaction localに設定し、次の全地点でexpected exceptionとzero row countをassertした。

- `after_album`: album 0 / album_photos 0 / draft 0 / cover 0 / analytics 0
- `after_photos`: album 0 / album_photos 0 / draft 0 / cover 0 / analytics 0
- `after_draft`: album 0 / album_photos 0 / draft 0 / cover 0 / analytics 0
- `after_cover`: album 0 / album_photos 0 / draft 0 / cover 0 / analytics 0

Probe transactionはrollback。後続read-only queryでもtest album/event残存0件を確認。

## Browser Result

- 共有`localhost:3000`は`/login`を表示し、認証済みsessionではなかった。
- Candidate →「アルバムを見る」→ Viewer、reload/double-openのBrowser E2Eは未実施。
- Provider注文/課金操作なし。
- 未認証Browserは繰り返し突破を試みず、Release Gateとして残す。

## Verification

- `node --experimental-strip-types --test tests/*.test.mjs`: PASS（848 / 848）
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS
- 変更範囲lint: PASS
- `git diff --check`: PASS
- migration list / post-apply dry-run: PASS

## Remaining Issues

- **Release Gate:** authenticated Candidate → Viewer Browser E2Eとreload/double-openは未確認。認証session利用可能時に実施する。
- Atomic failure probesは既存の安全な12-photo期間でrollback-only実行済み。永続的なtest fixtureは残していない。
- ローカルにあるTask063以前のmigration filesは既存状態のまま。Task063.2でremote適用したschema changeは対象atomic materialization migrationのみ。

## Git

- commit: 未実施
- push: 未実施
- provider注文 / 課金: 未実施
