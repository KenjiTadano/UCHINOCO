# Task065.2 Remote Smart Placement Verification

実施日: 2026-10-04
判定: **Remote placement / concurrency / rollback / protection PASS。Browser E2E未完了。**

## Migration / Types

- Pre-check `npx supabase migration list` / `db push --dry-run`: pendingは`20261004150000_smart_added_photo_placement.sql`の1件のみ。
- `npx supabase db push`: 上記1件の適用に成功。
- Post-check migration list: local / remoteとも`20261004150000`。
- Post-check dry-run: up-to-date、pending 0件。
- `npx supabase gen types typescript --linked --schema public`でtypesを再生成し、apply / undo / redo RPC signatureを確認。

## Placement Result

既存safe periodの実photoを使い、authenticated claimとrollback-only transactionで全3 modeを実行した。

- **EXISTING_SPREAD:** 3-frame anchorのみ4-frameへ変換。placement photo/frame追加を確認。other spreadと既存frameは維持。
- **INSERT_AFTER:** 新spreadをanchor直後へ追加。new version positionsは0 / 1 / 2、old Draft positionsは0 / 1のまま。
- **APPEND:** 新spreadを末尾position 2へ追加。
- 全modeでnew Draft versionがactiveになり、元Draftの写真/layout/crop等の内容は不変。
- Cover（manual title/photo）、other spreadのcrop/photo/layout、manual text/decoration/background/page elementがclone先に保たれることをassert。

## Undo / Redo

各placement modeでRPC apply → Undo → parent Draft active → Redo → placement Draft active → Undoを検証。Draft rowsはdeleteされず、active-version切替で戻る。

## Position / Concurrency

- INSERT_AFTER: position 0/1/2が一意で、insertionはanchor position+1、old Draftのpositionは変わらない。
- APPEND: position 0/1/2が一意で末尾に配置。
- 2 sessionの同一request競合: 先行sessionがplacement Draftを作成、待機sessionは`reused=true`。placement versionは1件のみ、active versionも1件、spread/frame/eventも重複なし。
- 2 sessionの異なるphoto selection競合: 待機側は`stale draft version`でreject。
- race probeでdeadlockなし。
- concurrency fixturesを削除し、album/photo/draft/analytics残存0件を確認。

## Rollback

Migrationにはfailure injection hookがないため追加していない。代替として、APPEND時にcopy済みspreadと同じ`story_spread_id`を作るunique violationを途中で発生させた。

- 例外後、original Draftが唯一のactive version。
- partial new version/spread/frame/cover/analyticsは0件。
- placement / rollback / protection probesはtransaction rollback。Committed concurrency fixturesは明示削除し、fixture rowを残していない。

## Protection

Rollback-only fixtureで次を実DB確認。

- stale fingerprint: reject
- stale active version: reject
- wrong owner / route pet: reject
- album ready/ordered、Draft locked、accepted event、pending/paid order、finalized print snapshot: reject
- Final stateはRPC entry後に安全側で再確認する。

## Browser

- 共有`localhost:3000`は`/login`を表示。認証済みsessionなし。
- placement preview → apply → reload → undo → redoのBrowser E2Eは未実施。認証不可としてRelease Gateへ残す。

## Verification

- `node --experimental-strip-types --test tests/*.test.mjs`: PASS（887 / 887）
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS
- scoped lint: PASS
- `git diff --check`: PASS
- Final migration dry-run: pending 0件

## Remaining Issues / Git

- **Release Gate:** authenticated Browser E2Eが未確認。
- migration failure injectionは存在しないため追加せず、constraint violationのrollback probeでatomicityを確認。
- commit: 未実施
- push: 未実施
