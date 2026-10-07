# Task064.1 — Atomic Suggested Photo Add & Protection

## Root risk

Task064のServer Actionは、保護状態とcandidateを確認した後、最大position取得、`album_photos`追加、Analytics追加を別々のDB requestで行っていた。その間にaccept、Draft lock、注文、active version変更、写真追加が起きるTOCTOUがあり、並行requestが同じpositionを採番する可能性と、写真だけ追加されAnalyticsが失敗するpartial successがあった。

## Transaction design

新規RPC `add_suggested_album_photos` を追加した。1 transaction内で以下を順に実行する。

1. `auth.uid()`確認
2. album単位transaction lock
3. owner・route anchor pet・album status=`draft`確認
4. expected active Draft versionをrow lockし、active/unlockedを確認
5. accepted event、pending/paid order、finalized print snapshotがないことを確認
6. anchor pet + `album_pets`全件のownerを確認
7. generation時photo IDsと現在period photosからcandidate集合を再構成
8. candidate fingerprintをDB内でSHA-256再計算
9. selected IDsがcandidate subsetであることを確認
10. 未追加写真だけを末尾へ採番して追加
11. 実追加件数が1件以上の場合だけaggregate Analyticsを追加
12. 実追加件数を返却

例外時は写真追加とAnalyticsが同じtransactionでrollbackされる。

## Concurrency strategy

`pg_advisory_xact_lock(hashtextextended('album-suggestion:' || album_id, 0))` で同一albumの追加・dismissを直列化する。lock取得後に全mutable stateを再読込する。`max(position)+1` はtransaction内かつlock後に計算し、実際にinsertした写真だけpositionをインクリメントする。

## Idempotency

- `(album_id, photo_id)`の既存一意制約に加え、RPC内でも既存写真をskipする。
- skipした写真は再採番しない。
- 全件skipなら `inserted_count=0`、`new_photos_added` eventは作成しない。
- 同fingerprintで異なる選択が並行した場合も直列化され、それぞれ未追加の写真だけが一意な末尾positionへ入る。
- Analytics event keyは実追加写真集合からDB内で作るSHA-256。photo ID本文は保存しない。unique conflictはsuccess相当で無視する。

## Protection result

RPC内で以下を最終拒否する。

- wrong owner / route pet mismatch
- album statusがdraft以外（ready/orderedを含む）
- active Draft version不一致・変更済み
- locked Draft
- accepted album
- pending/paid order
- finalized print snapshot
- stale candidate fingerprint
- unrelated pet / owner不一致pet
- candidate外photo ID

既存の `check_album_photos_mutable()` はorderedのみを保護している。広範なtrigger強化は既存Album generation/Editorへの影響が大きいため変更せず、Task064経路を専用RPC内で閉じた。

## Existing edit protection

RPCは `album_photos` とappend-only Analytics以外を書き換えない。Draft version、spread、frame、cover、manual crop/layout/text/decoration/background/photo swap/user orderにはupdate/deleteを行わない。

## Dismiss

`dismiss_suggested_album_photos` を別RPCとして追加した。owner、album status、active version、locked、accepted/order/finalized、multi-pet ownership、現在candidate fingerprintを同じalbum lock内で再検証してからdismiss eventを保存する。失敗時はdismiss済みにならない。

## Migration

- `supabase/migrations/20261004140000_atomic_suggested_photo_add.sql`
- `add_suggested_album_photos(...)`
- `dismiss_suggested_album_photos(...)`
- authenticatedのみexecute可能。anon/public/service_roleへのgrantは行わない。
- remote DBへは未適用。

## Tests

- Task064.1 focused tests: 8 passed
- Task064/064.1 combined focused tests: 14 passed
- Full suite: 875 passed
- `npx tsc --noEmit`: passed
- scoped ESLint: passed
- `npm run build`: passed
- `git diff --check`: passed
- 既知警告: Node ESM package type警告、Apple Silicon上のRosetta 2 Node警告

構造テストではsuccessful/selective/add-all経路、duplicate skip、advisory lock、unique position、accepted/locked/order/finalized/stale/owner/pet-scope保護、Analytics同一transaction、zero insert時eventなし、Draft編集非変更を確認した。

## Remote verification

`npx supabase db push --dry-run` は成功し、適用予定は `20261004140000_atomic_suggested_photo_add.sql` のみ。remoteへの変更は禁止条件に従い実施していないため、remote rollback transactionによる実関数実行は未実施。

## Remaining issues

- migration適用後、実DB上で2 sessionからの同時RPC、accepted/lock/order切替とのrace、rollbackをE2E確認する必要がある。
- PostgreSQL RPCは例外時にtransaction全体をrollbackする設計だが、未適用migrationのためremote実行証跡はまだない。
- Task064同様、写真はDraft候補集合へ追加し、spread/frame/coverの自動再配置は行わない。

## Git

commit / pushは実施していない。
