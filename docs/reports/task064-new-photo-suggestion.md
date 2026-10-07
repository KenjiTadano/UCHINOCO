# Task064 — New Photo Suggestion for Existing Draft

## Summary

既存Draftの生成時写真集合と現在の対象期間写真集合を比較し、新しく増えた写真だけを提案する仕組みを追加した。検出・確認・追加・dismissのいずれでも、既存のspread/frame/coverや手動編集値は自動変更しない。

## Detection

- 新規作成Draftでは `generation_metadata.generation_photo_ids` に生成時の対象期間写真IDを保存する。
- Task063 Candidate由来Draftでは既存の `passive_candidate_photo_ids` を優先して再利用する。
- 旧Draftは保存済みframe写真IDを基準にし、Draft作成後に登録された写真だけへ保守的に絞る。
- 現在写真はalbumの `period_from <= timeline_at < period_to` とalbumに紐づく全pet IDで取得する。
- `uploader_user_id = auth user`、pets所有権、album所有権、RLSを重ねて確認する。
- 既に `album_photos` に入っている写真は候補から除外するため、同一写真を重複追加しない。

## Suggestion UX

- Album Viewer（完成表示を含む）とPage Editorに軽量な通知を表示する。
- 通知は「新しい写真がN枚あります」、CTAは「確認する」。強制モーダルは使用しない。
- Review画面はthumbnail優先のprivate signed URL、撮影日、保存済みBest Shot score（取得できない場合は未評価）、既存albumとの重複状態を表示する。
- 「この写真を追加」「すべて追加」「今回は追加しない」を提供する。

## Safe Add / Edit Protection

- 選択写真だけを `album_photos` の末尾へ `selected_by=user` で追加する。
- Draftの候補集合への追加に限定し、既存 `album_draft_versions`、spread、frame、coverを再生成・更新しない。
- したがってmanual crop/layout、text、stamp、decoration、background、photo swap、user order、cover overrideはそのまま保持される。
- Album全体のSmart Layout / Rhythm再生成は行わない。追加写真は既存Editorの候補写真として利用でき、ユーザーが配置を選べる。対象spread周辺だけを自動再構成する機能は将来拡張事項。

## Protection

- album statusがdraft以外、active draftがlocked、accept済み、pending/paid orderありの場合は提案を生成しない。
- ordered/finalized/accepted内容は変更しない。
- multi-petは `album_pets` とanchor petを統合し、全petが同一ownerであることを確認する。関係ないpetはDB条件で候補外になる。

## Fingerprint / Dismiss

- fingerprintは `album ID + active draft version ID + sorted new photo IDs` のSHA-256。
- dismissは既存append-only analyticsへ `new_photos_dismissed` とfingerprintを保存する。
- 同fingerprintは再通知しない。さらに写真が増えるとfingerprintが変わり、再提案される。
- eventのunique indexにより同一dismissやsuggest/review eventの重複も抑止する。

## Analytics / Privacy

追加event:

- `new_photos_suggested`
- `new_photos_reviewed`
- `new_photos_added`
- `new_photos_dismissed`

event dataは `photo_count` のみ。caption、Storage path、signed URL、写真本文は保存しない。選択集合のevent keyも写真ID列挙ではなくSHA-256を使用する。

## Migration

- `20261004130000_album_new_photo_analytics.sql`
- 既存analytics event type CHECKへ4 eventを追加するだけで、新テーブルやDraft schemaは追加しない。
- `npx supabase db push --dry-run` 成功。remote未適用で、上記migrationのみが適用予定。

## Validation

- Full suite: 854 tests passed
- `npx tsc --noEmit`: passed
- scoped ESLint: passed
- `npm run build`: passed
- `git diff --check`: passed
- Build warning: Apple Silicon上でx86-64 Node/Rosetta 2を使用している既知警告のみ

## Remaining issues

- 古いDraftには完全な生成時候補集合がないため、保存frame IDとDraft作成時刻を用いる保守的fallbackになる。新規DraftとTask063 DraftはID snapshotで正確に判定する。
- safe addは編集保護を優先し、写真を候補集合へ加えるところまで。既存spreadを壊さない局所的な自動配置は未実装。
- NOW secondary actionは今回必須ではないため追加していない。Viewer/Editor通知を正式導線とした。

## Git

commit / pushは実施していない。
