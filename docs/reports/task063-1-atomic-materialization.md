# Task063.1 — Atomic Candidate Materialization 実装報告

## Root risk

Task063のmaterializeはServer Actionから次を別々に保存していた。

1. `albums` insert
2. `album_photos` upsert
3. `save_album_draft_version()`
4. `albums.cover_photo_id` update
5. `album_draft_covers` insert
6. analytics insert

途中失敗時は作成済みalbumのbest-effort deleteへ依存していたため、削除自体の失敗や並行openとの競合によりpartial album / photos / draft / coverが残る余地があった。

## Transaction design

Migration `20261004120000_atomic_passive_album_materialization.sql` に `public.materialize_passive_album_candidate(...)` を追加した。

- `security invoker`
- authenticatedのみexecute可能
- 1 RPC / 1 PostgreSQL transaction
- `pg_advisory_xact_lock()` で同fingerprintを直列化
- Task063のdeterministic album UUIDをDB内でも再計算
- `auth.uid()` とpet ownershipを再検証
- 対象期間の現在photo IDsを再取得してCandidate photo IDsと完全一致を確認
- 選定写真がCandidate集合のsubsetであることを確認
- Draft payload内の写真と選定写真が完全一致することを確認
- Candidate version / fingerprint / period / photo IDs / materialized flag / Rhythm v2 metadataを確認
- 既存の `save_album_draft_version()` を同transaction内で利用
- album、album_photos、Draft、spreads、frames、cover、analyticsを同transaction内で保存

Server Actionは永続化の直接insert/update/upsertを廃止し、このRPCだけを呼ぶ。

## Protection

RPC内で次を保護する。

- owner違反
- stale fingerprint / stale photo set
- deterministic album ID不一致
- edited active Draft
- accepted album
- ready album
- ordered album
- finalized print snapshot

既に同fingerprintで完成しているDraftは変更せず、既存album ID / Draft version IDを返す。

## Rollback result

DB session専用の `uchinoco.test_materialize_failure_stage` を用意し、次の地点で例外を発生できる。

- `after_album`
- `after_photos`
- `after_draft`
- `after_cover`

この値はRPC引数には公開していない。すべて同じPL/pgSQL function内の例外であるため、各地点の失敗時はtransaction全体がrollbackされ、album / album_photos / Draft / cover / analyticsはいずれも残らない。Server Action側のcleanup deleteは削除した。

Remote DBへmigrationは未適用のため、実DB failure injectionは未実施。migration構造テストで全failure pointがtransaction内にあり、cleanup依存がないことを確認した。

## Idempotency / concurrency

- fingerprint由来のalbum UUIDは従来仕様を維持。
- fingerprint単位のtransaction advisory lockで同時openを直列化。
- 1件目が作成後、2件目はactive Draftのgeneration metadataを確認して`reused: true`を返す。
- albumは1件、active Draftは1件、`album_photos`は複合primary keyにより重複0件。
- accepted / edited / ordered状態を再生成・上書きしない。

## Generation metadata

Task063の以下を維持した。

- `passive_candidate_version`
- `passive_candidate_fingerprint`
- `passive_candidate_photo_ids`
- `passive_candidate_period`
- `materialized_on_open`
- Photo Intelligence / grouping / Best Shot / candidate / Story / Draft / generation versions
- `composition.version = album-rhythm-v2`
- layout rankings / composition / signature

## Migration result

- 追加migration: `supabase/migrations/20261004120000_atomic_passive_album_materialization.sql`
- `npx supabase db push --dry-run`: 成功
- Remoteへ適用されるmigrationは上記1件のみと確認
- Remote pushは未実施
- DB schemaの新table / columnは追加していない

## Tests

- 全suite: 848 passed / 0 failed
- Task063.1 tests: success path、duplicate、concurrent lock、4 rollback point、owner violation、stale fingerprint、edited/accepted/ready/ordered/finalized protection、metadata round-tripを検証
- `npx tsc --noEmit`: 成功
- scoped ESLint: 成功（error / warningなし）
- `npm run build`: 成功
- `git diff --check`: 成功
- Build warning: Apple Silicon上のRosetta 2 Node警告のみ
- Test warning: 既存の`MODULE_TYPELESS_PACKAGE_JSON`警告

## Remaining issues

- Migrationはremote未適用のため、適用前のブラウザ操作では新RPCを利用できない。
- Remote適用後、実DBでfailure-injection用session設定を使うには管理接続が必要。通常のauthenticated RPC利用者にはfailure stageを公開していない。
- Task063の既存partial rowが既に存在する場合、新RPCは安全側で`existing album is protected`として停止し、自動修復・削除しない。
- multi-pet Passive Candidateは引き続き対象外。

## Git

commit / pushは実施していない。
