# Task065.1 True Local Smart Placement 実装報告

## 概要

Task065の配置候補はStory近接度を順位付けしていたものの、確定処理はactive Draftの末尾へ1-photo spreadを直接追加するだけだった。本対応では、候補を `EXISTING_SPREAD` / `INSERT_AFTER` / `APPEND` に分け、元Draftを変更せず新しいDraft versionへ全構成を複製して局所変更する方式へ置き換えた。

## Draft version戦略

- RPC開始時にalbum単位のtransaction advisory lockを取得する。
- owner、album状態、active version、lock、accepted、order、finalized print、photo scope、fingerprintをDB内で再検証する。
- 元active versionを非active化し、generation metadataを継承した新versionを作る。
- spreads、frames、text、decoration、page elements、background、coverを新しいIDでcopyする。
- page elementは主キーと `element_data.id` を同じ新UUIDへ更新する。
- 対象箇所だけを変更し、新versionをactiveにする。
- 途中例外はPostgreSQL transaction全体をrollbackするためpartial Draftを残さない。

## Placement方式

### EXISTING_SPREAD

- manual editのない3-photo STORY/GRIDのみ対象。
- 既存3枚の順序とcrop値を保持し、L06またはL07の4-photo layoutへ変換する。
- 新写真を4番目のframeへ配置する。
- DB側でもframe数、layout/crop/photo/text/decoration/page element/backgroundの編集状態を再検証する。

### INSERT_AFTER

- 同日・近いStoryのanchor直後へ1-photo spreadを挿入する。
- anchorが編集済みでもanchor自体はcopyのみで変更しない。
- 新version側でanchorより後のpositionだけを+1し、中央挿入する。

### APPEND

- 安全なStory anchorがない場合のfallbackに限定する。
- 新versionの末尾positionへ1-photo spreadを追加する。

## Preview

- Preview pageはread-onlyのまま維持した。
- Smart Layout catalogの実geometryを使用してbefore/after候補を表示する。
- 「このページに追加」「このページの後に追加」「最後に追加」を区別する。
- 最大3案をdeterministicに返し、新規Vision callは行わない。

## Edit protection

- manual layout、crop、photo swap、text、decoration、page element、backgroundのあるspreadはEXISTING_SPREADから除外する。
- INSERT_AFTERでは編集済みanchorの全内容をそのままcopyし、既存frameを移動しない。
- target以外の全spreadとcoverもuser override、revision、client sequenceを含めてcopyする。
- accepted / pending・paid order / finalized print / locked versionへの適用、Undo、Redoを拒否する。

## Atomicity / idempotency

- Apply、clone、局所変更、analyticsは単一RPC transaction。
- active version raceとcandidate fingerprint変化をRPC内で拒否する。
- 同fingerprintの再送は作成済みplacement versionを再利用し、重複Draftを作らない。
- SQL migrationは一つのtransactionで定義され、remoteには未適用。

## Undo / Redo

- Apply後の新versionにparent version IDを保存する。
- Undoはplacement versionを削除せず、元versionをactiveへ戻す。
- Redoは保持済みplacement versionを再active化する。
- spread単体削除に依存しないため、元DraftとPlacement Draftの双方が完全な状態で残る。

## Rhythm guard

- HERO / TITLE / INTRO / QUIET / EVENTはEXISTING_SPREAD候補にしない。
- STORY / GRIDだけを近接anchorとして評価し、既存ページを再生成しない。
- 局所変更以外のRhythm改善は行わず、既存ユーザー編集を優先する。

## テスト結果

- `node --experimental-strip-types --test tests/*.test.mjs`: 887件成功
- `npx tsc --noEmit`: 成功
- scoped ESLint: 成功
- `npm run build`: 成功
- `git diff --check`: 成功
- `npx supabase db push --dry-run`: remoteへ適用せず、`20261004150000_smart_added_photo_placement.sql` 1件のみが適用候補であることを確認

## Remaining issues

- dry-runは適用予定migrationの確認であり、remote rollback transactionを使った実DB failure injectionは実施していない。remote適用前にstagingまたはrollback可能な検証環境で、insert途中の例外、並行Apply、Undo/Redoを実DB確認することを推奨する。
- multi-pet albumの写真scopeは `album_pets` までRPC内で検証するが、既存cover制約などTask065.1外のmulti-pet制約は変更していない。
- Undo後に別編集を開始した場合はactive version raceにより古いRedoを拒否する設計である。

## Git / remote

- commit / push: 未実施
- migration remote適用: 未実施
