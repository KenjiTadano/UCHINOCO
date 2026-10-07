# Task066 — Album Lifecycle & Monthly Continuation

## 概要

月ごとの写真収集から候補、編集、完成、注文・印刷までを、既存データから導出するライフサイクルとして実装した。新しい永続化テーブルや状態カラムは追加せず、Task063のPassive Candidate、Task064の新写真提案、既存のDraft・注文・印刷スナップショットを組み合わせている。

## Lifecycle model

- `COLLECTING`: 月内写真が候補生成条件を満たしていない、または条件到達後も候補準備が完了していない
- `CANDIDATE_READY`: Passive Candidateが準備済みで未確認
- `DRAFT`: 正式Draftへmaterialize済み
- `ACCEPTED`: アルバムが完成・受入済み
- `ORDERED`: 注文処理中または注文済み
- `FINALIZED`: 印刷スナップショットが確定済み

状態は保護度の高い `FINALIZED > ORDERED > ACCEPTED > DRAFT > CANDIDATE_READY > COLLECTING` の順で導出する。閾値へ到達しただけではReady扱いにせず、候補が実際に準備できるまでは「写真を整理しています」と表示する。

## Month rollover

- `Asia/Tokyo` の月初00:00から翌月月初00:00までを半開区間として扱う。
- 月キーは `YYYY-MM` とし、候補画面・Server Actionにも検証済み月キーを渡す。
- Candidate fingerprintには既存どおりperiodが含まれるため、前月と今月は同じ写真集合でも別候補になる。
- 保護対象アルバムの期間判定を厳密な重なり判定へ修正し、前月の終了時刻と今月の開始時刻が同一でも今月候補を誤ってブロックしない。

## Previous month protection

- 既存のaccepted、ordered、finalized、編集済みDraftは候補準備時の保護判定で再生成・上書きしない。
- 前月候補と今月候補は別period・別fingerprintとして扱う。
- 正式DraftはTask063/063.1の決定的IDとatomic materializationをそのまま利用し、同月・同候補の重複Draftを作らない。

## Late photo handling

- 撮影日時が前月の写真は、追加日時が今月でも今月Candidateへ含めない。
- 未確定の前月Draftには、Task064がDraft生成時photo IDsと現在の前月period photo IDsの差分を検出し、新写真提案として扱う。
- accepted、ordered、finalizedな前月アルバムはTask064の保護判定により提案・自動変更の対象外となる。
- 写真を自動mergeせず、既存の編集結果と完成物を保持する。

## UCHINOCO NOW / Album list

- NOWは今月の候補または今月DraftをPrimaryとして扱う。
- 前月に未確認Candidateがある場合は「前月のアルバムもできています」をSecondary actionとして提示できる。
- 今月は実写真数と既存閾値から「今月の写真 N枚」「あとN枚」を表示する。
- Album listには今月の収集中状態、今月・前月の未確認Candidate、既存アルバムを月キー降順で表示する。
- 状態表示は「写真を集めています」「AIがまとめました・未確認」「編集中」「完成」「印刷手続き中」「印刷済み」を区別する。

## Monthly Candidate

- Task063の保存済み解析優先・不足時のみ既存生成処理というコストガードを維持した。
- current/previousの対象月だけを小さく評価し、全期間の再解析は行わない。
- 写真数が閾値未満の月はCandidateを作らない。
- single-pet限定というTask063の制約を維持し、multi-pet候補を暗黙に永続化しない。

## 変更ファイル

- `lib/album-monthly-lifecycle.ts`（新規）
- `lib/passive-album-candidate-server.ts`
- `lib/uchinoco-now.ts`
- `app/(app)/home/page.tsx`
- `app/(app)/pets/[petId]/album/page.tsx`
- `app/(app)/pets/[petId]/album/candidate/page.tsx`
- `app/(app)/pets/[petId]/album/candidate/candidate-open-form.tsx`
- `app/(app)/pets/[petId]/album/candidate/actions.ts`
- `tests/album-monthly-lifecycle.test.mjs`（新規）
- `tests/uchinoco-now.test.mjs`
- `tests/album.test.mjs`

## Migration

Task066固有のmigrationは追加していない。状態は既存schemaから導出する。

## Tests

- 全suite: 898 passed / 0 failed
- `npx tsc --noEmit`: passed
- `npm run build`: passed
- scoped ESLint: 0 errors / 2 existing `no-img-element` warnings
- `git diff --check`: passed

月跨ぎ、JST境界、全状態の優先順位、低写真数、候補period分離、前月遅延写真のTask064経路、時系列表示、NOW今月優先、single-pet制約を追加テストで確認した。

## Remaining issues

- NOWとAlbum listで明示的に再提示する未確認Passive Candidateは、画面密度を抑えるため今月と直前月まで。さらに古い未materialize候補を横断表示する履歴UIは未実装。
- Passive Candidateはバックグラウンドジョブで常時生成せず、認証済みのHome/Albumアクセス時に対象月だけ準備する既存方式を維持している。
- scoped ESLintの2警告はAlbum画面の既存`<img>`で、private signed URL表示の既存実装に由来する。Task066では変更していない。
- テスト実行時にNodeの`MODULE_TYPELESS_PACKAGE_JSON`警告、ビルド時にRosetta 2警告が出るが、テスト・ビルド結果には影響していない。

## Git

commit / pushは実施していない。
