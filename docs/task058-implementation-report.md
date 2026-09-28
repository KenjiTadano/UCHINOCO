# Task058 AI Album Draft Persistence / Autosave 実装報告書

AI初稿をDBに残したまま、ユーザー変更だけをOverrideとして保存し、再読込後もAI初期値へ戻せる。本番の07 Editorには接続していない。commit / push はしていない。

Labは `/dev/album-persistence`。対象はペット「わか」、期間2023年7月、専用アルバム「AI Draft Lab 2023-07」（status `draft`）。

今回の実生成は、Task057の基準（Spread 2 が `4c8d611f` hero / `736ba321` secondary、Spread 3 が L01b）とは別の結果だった。永続化はこの場で生成された初稿を保存している。

| Spread | Layout | Frames |
| --- | --- | --- |
| 1 | L02 | `6e407fca` primary、`8f3ac783` primary |
| 2 | L12 | `736ba321` hero、`fbcf1f1b` secondary |
| 3 | L01 | `518333d3` hero |

3 spread / 5 frame。

---

## 1. Migration

既存migrationは変更していない。追加は次の2本。

- `supabase/migrations/20260927120000_album_draft_persistence.sql`
- `supabase/migrations/20260927123000_fix_album_draft_guard.sql`

2本目は、spread / frame に `status` 列がないのに共有guardが `NEW.status` を読んでいた不具合の修正。初回保存が `record "new" has no field "status"` でロールバックしたため追加した。

## 2. DB schema

新規テーブルは `album_draft_versions`、`album_draft_spreads`、`album_draft_frames`。

含むもの: FK、unique、index、`updated_at` trigger（`set_updated_at()`）、RLS、guard trigger、security invoker RPC。

`albums`、`album_photos`、`orders`、`order_photos`、`print_jobs` の既存構造は変更していない。

## 3. Draft Version

`album_draft_versions`

- `id` uuid PK
- `album_id` FK `albums`（cascade）
- `generation_version` text
- `status` : `ready` / `editing` / `locked`
- `is_active` boolean
- `revision` integer（1以上）
- `generation_metadata` jsonb
- `created_at` / `updated_at`

activeは部分unique index `album_draft_versions_one_active_idx`（`where is_active`）で、1アルバムにつき1件。再生成は現行AI Stateを書き換えず、新しいversionを作る構造。Editorからのversion削除は実装していない。

## 4. Spread schema

`album_draft_spreads`

- `draft_version_id` FK（cascade）
- `story_spread_id`、`position`、`story_type`、`recommended_density`、`importance`、`coherence`
- `ai_layout_id`、nullable `user_layout_id`
- `warnings` jsonb
- `revision`、`client_seq`
- `created_at` / `updated_at`

unique: `(draft_version_id, story_spread_id)`、`(draft_version_id, position)`。

## 5. Frame schema

`album_draft_frames`

- `draft_spread_id` FK（cascade）
- `frame_id`、`role`、`position`
- AI: `ai_photo_id`、`ai_crop_x`、`ai_crop_y`、`ai_crop_scale`
- User: `user_photo_id`、`user_crop_x`、`user_crop_y`、`user_crop_scale`（すべてnullable）
- `match_tier`、`crop_quality`、`warnings` jsonb
- `revision`、`client_seq`
- `created_at` / `updated_at`

unique: `(draft_spread_id, frame_id)`、`(draft_spread_id, position)`。

`ai_photo_id` は `photos` へ restrict。`user_photo_id` は set null。写真は対象アルバムのペットかつ所有者の写真だけを許可する。

## 6. Generation metadata

`generation_metadata` に次を保存する。

- `photo_intelligence_version`: `photo-intelligence-v1`
- `photo_grouping_version`: `photo-grouping-v1`
- `best_shot_version`: `best-shot-v1`
- `album_candidates_version`: `album-candidates-v1`
- `album_story_version`: `album-story-v1`
- `album_draft_version`: `album-draft-v1`
- `album_generation_version`: `album-generation-v1`

あわせて draft signature を保存する。

## 7. AI State

初回保存はAI列だけを書く。通常の編集RPCは `ai_layout_id`、`ai_photo_id`、`ai_crop_*` を更新しない。guardはAI列の変更を `AI Stateは変更できません` で拒否する。

## 8. User Override

layout、crop、写真差し替えは `user_layout_id`、`user_crop_*`、`user_photo_id` だけを更新する。Resetは該当するuser列をNULLへ戻す。行のDELETEではない。

## 9. Effective resolver

共通関数は `resolveEffectiveSpread()` と `resolveEffectiveFrame()`（`lib/album-persistence/resolve.ts`）。

- Layout: `user_layout_id` があればそれ、なければ `ai_layout_id`
- Photo: `user_photo_id` があればそれ、なければ `ai_photo_id`
- Crop: 軸ごとに user 値があれば user、なければ AI

UI側に同じフォールバックを書いていない。

## 10. Initial Save

`AlbumGenerationResult` を `buildDraftSavePayload` で変換し、RPC `save_album_draft_version` で保存する。user列はSQL側でNULLにする。2023年7月の保存は 3 spread / 5 frame。

## 11. Idempotency

active versionの metadata signature が一致すれば、同じversion idを返す。spread / frame の unique 制約で行は増えない。

## 12. Load

version、spreads、frames を取得し、effective state で Book Preview を再構成する。画像URLは `pet-photos` の署名URL。

## 13. Layout Override

今回のSpread 3のAI layoutは L01 だった。LabのボタンはAIと反対の L01b を `user_layout_id` に保存する。

再読込後:

- AI Layout: L01
- User Layout: L01b
- Effective Layout: L01b

## 14. Crop Override

Spread 2 secondary を zoom。AI crop `0.5, 0.375, 1` はそのまま、user scale `1.12` を保存。再読込後も user crop が残った。

## 15. Photo Override

同じペットの所有写真 `8f3ac783` を `user_photo_id` に保存。AI photo は `fbcf1f1b` のまま。再読込後も effective photo は `8f3ac783`。

## 16. Reset Layout

`user_layout_id` のみNULL。`ai_layout_id` は L01 のまま。

再読込後:

- AI Layout: L01
- User Layout: NULL
- Effective Layout: L01

## 17. Reset Crop

`user_crop_x` / `user_crop_y` / `user_crop_scale` をNULLへ戻し、effective は AI crop に戻った。写真Resetのあとにもう一度cropをResetし、最終の再読込でも user crop は NULL。

## 18. Autosave

debounceは `AUTOSAVE_DEBOUNCE_MS = 700`。cropはdebounce、layout・photo・resetは即時。保存は部分更新で、layoutはspread、cropとphotoはframeだけ。

UI状態は `saving` / `saved` / `error`。表示は `Saving...` / `Saved` / `Save failed`。操作直後に見た目を変え、保存完了を待ってから描画を変えていない。失敗時は操作を戻さず、errorを出して再試行できる。

## 19. Race protection

Race cropは x を `+0.04`（900ms）、`+0.10`（300ms）、`+0.18`（即時）で送る。画面は最後の `0.68` に即時更新される。遅い先行リクエストが返っても、より新しい `client_seq` は上書きしない。再読込後も `0.68, 0.375, 1` が残った。

## 20. Revision conflict

更新条件は `client_seq < 受信seq`、または `client_seq` が同じかつ `revision` が期待値。成功時は revision を +1。同じseqでrevisionが違う場合は `conflict`。より新しいseqが既にある場合は `stale`。失敗したUPDATEのあとに行を読み直し、同時コミットをconflictと誤認しない。

## 21. RLS

ownerの SELECT / INSERT / UPDATE のみ。DELETEは付与していない。RPCは `authenticated` 向けの security invoker。`anon` と `service_role` からは revoke。

## 22. Cross-owner deny

他ユーザー向けの select / update / insert ポリシーはない。検証は migration を読む構造テスト。別ユーザーでのブラウザ操作は行っていない。

## 23. Ordered guard

`albums.status = ordered` のとき、spread / frame / override の更新を trigger が拒否する。例外メッセージは既存guardと同じ「このアルバムは注文済みのため変更できません」（errcode `P0001`）。ordered化に伴う active draft の `locked` 更新だけを許可する。UIのdisabledだけには依存していない。

`20260927123000` で、`NEW.status` の参照を `album_draft_versions` の UPDATE の内側に限定した。

## 24. Paid snapshot safety

draftの保存と更新は `orders`、`order_photos`、`print_jobs` を書かない。既存の paid snapshot は `album_photos` 由来のまま。構造テストで、新migrationがそれらのテーブルへ INSERT / UPDATE しないことを確認している。

## 25. 2023-07 Save

わか、2023年7月、8枚。Generate AI Draft のあと Save Draft。保存状態は Saved。3 spread / 5 frame。

## 26. Reload result

ブラウザのページ再読込のあと Reload Draft。3 spread / 5 frame、user列は空、画像は loaded。レイアウトは L02 / L12 / L01。

## 27. Browser override result

再読込後に残ったoverride:

- Spread 3: AI L01 / User L01b / Effective L01b
- Spread 2 secondary crop: AI `0.5, 0.375, 1` / User `0.680, 0.375, 1.000`
- Spread 2 secondary photo: AI `fbcf1f1b` / User `8f3ac783`

スクリーンショット: `docs/album-persistence-058-override.png`

## 28. Browser reset result

layout、crop、photoをそれぞれ Reset し、ページ再読込のあと Reload Draft。全 user 列は NULL。effective は AI 値。画像は loaded。

最終状態:

- Spread 1: L02、user NULL
- Spread 2: L12、user NULL、secondary crop は AI `0.5, 0.375, 1`
- Spread 3: L01、user NULL

スクリーンショット: `docs/album-persistence-058-verify.png`

## 29. db reset

ローカルの Docker socket がなく、`supabase db reset` は実行できていない。

## 30. db push

リモートへ適用済み。

- `20260927120000_album_draft_persistence.sql`
- `20260927123000_fix_album_draft_guard.sql`

## 31. tsc

`npx tsc --noEmit` は成功。

## 32. build

`npm run build` は成功。

## 33. tests

`node --test tests/*.mjs` は 517 件すべて成功、失敗 0。うち永続化は `tests/album-persistence.test.mjs` の 18 件。

1. initial AI save
2. idempotent save
3. load effective state
4. layout override
5. reset layout
6. crop override
7. reset crop
8. photo override
9. autosave race
10. revision conflict
11. RLS owner read
12. RLS cross-owner deny
13. ordered guard
14. FK integrity
15. paid snapshot unchanged
16. generation metadata persistence

加えて、AI列の不変と active version の一意性。

`git diff --check` は問題なし。Task051〜057の既存テストもこの517件に含まれる。

## 34. git status

未コミット。

- `lib/album-persistence/`
- `app/(app)/dev/album-persistence/`
- `tests/album-persistence.test.mjs`
- `supabase/migrations/20260927120000_album_draft_persistence.sql`
- `supabase/migrations/20260927123000_fix_album_draft_guard.sql`
- `docs/album-persistence-058-verify.png`
- `docs/album-persistence-058-override.png`
- `lib/supabase/database.types.ts`（225行追加）

commit / push はしていない。
