# Task064.2 Remote Migration & Concurrency Verification

実施日: 2026-10-04
判定: **Remote migration / RPC / idempotency / rollback / concurrency PASS。Browser E2E未完了。**

## Migration

- Pre-check `npx supabase migration list`: local未適用のtargetは`20261004140000_atomic_suggested_photo_add.sql`だけ。
- Pre-check `npx supabase db push --dry-run`: target 1件のみ。seeds / rolesなし。
- `npx supabase db push`: target migration 1件の適用に成功。
- Post-check migration list: local / remoteとも`20261004140000` applied。
- Post-check dry-run: up-to-date、pending 0件。
- `npx supabase gen types typescript --linked --schema public`で`lib/supabase/database.types.ts`を再生成。add / dismiss RPC signatureを確認。generated typeの手書き変更なし。

## RPC Verification

既存petのsafe 12-photo期間を使ったauthenticated transaction probeを実施。追加行はrollbackまたはfixture cleanup済み。

- owner success: add RPC成功、期待photoが追加された。
- wrong owner: deny。
- stale active version: deny。
- locked Draft: deny。
- accepted event: deny。
- pending order / paid order / ordered album: deny。
- finalized print snapshot: deny。
- stale fingerprint / stale photo set: deny。
- wrong route pet / unrelated pet: deny。
- candidate外photo: `invalid selected photos`でdeny。
- existing album photoと候補外photoは変更されず、Draft/cover/spreads/framesを更新しない。

拒否reasonはSQL assertionと一致する。provider checkout / charge APIは実行していない。

## Idempotency

Rollback transaction内で同じphoto setを2回送信。

- 1回目: `inserted_count = 2`。
- 2回目: `inserted_count = 0`。
- album_photos: 3行（fixtureの初期写真1＋追加2）、3 unique photo、3 unique position。
- `new_photos_added`: 1 event。
- dismiss: valid success、同fingerprint再送も成功し1 eventのみ。stale fingerprintはdeny。

## Concurrency / Race Protection

- 別々のlinked DB sessionから同albumへ異なる写真を同時送信。両方`inserted_count = 1`、最終album_photosは3行 / 3 unique photos / 3 unique positions、added analyticsは2行。deadlockなし。
- Request待機中のstate raceを実DB2-sessionで確認: accepted marker、Draft lock、pending order、paid order、finalized snapshot。各commit後に待機中のadd RPCが最終状態を再確認してdeny。
- 別raceでrequest待機中にactive Draftを切替。旧draft versionを参照したRPCは`stale draft version`でdeny。
- race用synthetic album/orders/events/snapshotは削除し、関連tableが0行であることを確認。

## Browser

- 共有`localhost:3000`は`/login`を表示し、認証済みsessionなし。
- 新しい写真 → selective add → reloadのBrowser E2Eは未実施。認証を繰り返し突破する試みは行わずRelease Gateに残す。

## Verification

- `node --experimental-strip-types --test tests/*.test.mjs`: PASS（875 / 875、2026-10-04再実行）
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS
- 変更範囲lint: PASS
- `git diff --check`: PASS
- Migration list / dry-run: PASS、pending 0件

## Remaining Issues

- Authenticated Browser E2Eが未完了（sessionがlogin画面）。
- RPC concurrency / guard / rollbackはlinked remote transactionで確認済み。probe fixtureは残っていない。

## Test Count Reconciliation

- Task064.1 report recorded 875 full-suite tests; this report had an inconsistent 848 count.
- Re-running the exact full-suite command against the current tree registers 875 tests: 875 passed, 0 failed, 0 skipped.
- `tests/` has no deleted or renamed test files and no skip declarations. The Task064.1 atomic-materialization and Task064.2 atomic-suggested-photo test files remain present; together they pass 15 focused tests.
- One older page-editor test declaration, “editor open does not call Vision and signs original photos,” was removed, but its assertions are covered by the current “editor load does not call Vision or regenerate the album” and “frame preview uses the original object and the picker uses the thumbnail” tests. This does not account for 27 missing active cases.
- The 848 figure is therefore a stale/inconsistent report count, not evidence that 27 current tests were removed or skipped. The exact historical source of that stale count cannot be recovered from the current worktree.

## Git

- commit: 未実施
- push: 未実施
- provider注文 / 課金: 未実施
- analytics以外のschema migration適用: なし
