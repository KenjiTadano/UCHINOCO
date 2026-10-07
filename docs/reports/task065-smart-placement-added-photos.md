# Task065 — Smart Placement for Added Photos

## Placement logic

- Task064.1で追加された写真だけを配置対象にする。
- `taken_at ?? created_at`、Album Rhythm v2のspread role/density、Story開始日時、既存frame数、保存済みBest Shot score、保存済みSubject Geometryのorientation/focal pointを利用する。
- 新規Vision callは行わない。Subject Geometryがない場合だけ中央crop・square orientationへ安全にfallbackする。
- 同日（24時間未満）、3日以内、14日以内の順にStory proximityを加点する。
- frame数が少ないSTORY/GRIDを文脈アンカーとして優先し、最大3案へ制限する。

## Spread selection / rhythm protection

- HERO / TITLE / INTRO / QUIET / EVENTは候補アンカーから除外する。
- manual editがあるspreadと4枚到達spreadも除外する。
- HERO連続、GRID連続、高密度連続やQuiet消失を避けるため、既存spread自体は変更せず1枚用quiet spreadを局所追加する。
- 現行schemaのspread positionは連続integerであり、既存手動順序を動かさず途中挿入できないため、確定spreadは末尾へ追加する。候補アンカーはStory文脈の説明・ランキングにのみ使う。

## Edit protection

保護判定は以下を対象とする。

- user layout
- manual crop
- photo swap
- text override
- decoration override
- stamp / page element
- background

Apply RPCは既存spread/frame/coverをupdate/deleteしない。追加したTask065 spreadだけを作る。Undoも追加spreadが未編集の場合だけ削除でき、編集後の誤削除を拒否する。

## Preview UX

- `/new-photos/placement` を追加。
- BEFOREは既存ページ数と編集保持、AFTERは対象写真・layout・追加方式を表示する。
- Preview表示時はDB mutationを行わない。
- CTA: 「この配置を使う」「別案を見る」「新しいページにする」「今はしない」。
- alternative選択はURL stateで行い、最大3案を循環する。

## Apply / undo

- 明示Apply時だけ `apply_added_photo_placement` RPCを実行する。
- RPCはalbum lock、owner、anchor pet、active/unlocked Draft、accepted/order/finalized保護、`album_photos`登録、multi-pet scope、重複frameをtransaction内で検証する。
- 新spread + frame + aggregate Analyticsを1 transactionで保存する。
- 同じ写真は `task065:{photoId}` identityでidempotent。
- Apply完了画面の「元に戻す」は `undo_added_photo_placement` を1回実行する。未編集spreadのみ削除可能で、再度ApplyすればRedo相当になる。

## Crop

- 保存済み`subject_geometry`のorientationとfocalPointを再利用する。
- portraitはL01b、landscape/squareはL01を推奨する。
- 既存写真のAI crop / manual cropは変更しない。

## Multi-pet

- photoはanchor petまたは`album_pets`内に属し、かつ現在のauth userがuploadした`album_photos`であることをRPC内で確認する。
- 無関係petは拒否する。既存album全体のpet balanceは再構成しない。

## Analytics privacy

- `new_photo_placement_previewed`
- `new_photo_placement_applied`
- `new_photo_placement_alternative`
- `new_photo_placement_skipped`

保存値はphoto_count、spread_count、alternative_rankのみ。event keyはSHA-256で、photo ID、caption、pathは保存しない。

## Migration

- `20261004150000_smart_added_photo_placement.sql`
- Analytics event type拡張
- atomic Apply RPC
- protected Undo RPC
- remote未適用
- `npx supabase db push --dry-run`成功。適用予定はこのmigrationのみ。

## Tests

- Task065 tests: 7 passed
- Full suite: 882 passed
- `npx tsc --noEmit`: passed
- scoped ESLint: passed
- `npm run build`: passed
- `git diff --check`: passed
- 既知警告: Node ESM package type、Rosetta 2 Node

## Remaining issues

- 現行のAI frame IDはmutation guardで不変、spread positionは連続integerのため、既存spread内へframeを増やす／途中へspreadを差し込むには、全手動overrideを複製した新Draft versionをatomicに作る追加設計が必要。Task065では編集保護を優先し、新規1枚spreadの末尾追加に限定した。
- Undo/Redoは既存Editorのsession stackそのものではなく、同じ1操作UXを専用RPCで提供する。Page Editor上の共通Undo/Redo stackとの完全統合は未対応。
- migration適用後、実DBでApply/Undo、並行Apply、accepted/order raceをE2E確認する必要がある。

## Git

commit / pushは実施していない。
