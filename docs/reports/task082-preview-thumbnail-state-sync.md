# Task082.1 — Preview / Thumbnail State Synchronization

更新日: 2026-10-13（JST）

## Root cause / stale path

`/edit`一覧はactive draftを読まず、`album_photos`と旧写真解析から `buildAlbumPreviewSpreads` で別の構成を生成していた。保存先であるdraft spread/frameのuser layout・crop・photo overrideを反映しないため、再読み込みだけでは修復されない経路だった。

Previewのメインは `DraftSpreadView` を使う一方、サムネイルは先頭2枚の写真URLだけを `<img>` で表示し、layout・crop・imageFit・背景を描画していなかった。Page Editorのサムネイルは同じlocal viewを使っていたが、elements/backgrounds/digitalの指定がメインと異なっていた。

## Priority 1 — Source of truth

`/edit/page.tsx` は、PreviewとPage Editorが使う既存 `readDraft` でactive versionを読む。ページ数、spread ID、構成は `draft.spreads` から取得する。`album_photos`と旧解析による本文再構成は削除した。draftがない場合は明示エラーを表示し、自動再生成しない。

表紙も同じactive draft versionのcover rowを既存cover resolverで解決する。spread一覧から対応する `/pages/edit?spread=index` へ移動できる。

現在の表示経路:

- DB初期ロード: active draft → source spread/frame → effective override → persisted view
- Editor即時表示: `usePageEditDraft().view` → shared render props
- Preview・一覧: DBから読んだ同じpersisted view → shared render props
- layout: effective layout ID
- photo/crop: effective frame photo/crop
- imageFit: effective layoutの既存Registry定義
- layers: 同じspreadのtext、decoration、elements、backgrounds

別route・別tabへlocal stateを複製する新architectureは追加していない。routeを離れる際は保存を待ち、再ロード時はDBを読む。

## Priority 2 / 3 — Renderer unification

`draftSpreadRenderProps` は既存effective stateからrenderer propsを作る。メインとサムネイルで同じ `DraftSpreadView` を使用する。

`DraftSpreadThumbnail` は既存rendererを固定canvasで描き、ResizeObserverで表示幅に合わせて縮小する薄いwrapperである。別の画像生成・layout計算・crop計算は行わない。文字や装飾もcanvasと一緒に縮小する。thumbnailではviewport高さによるメイン用width制限を無効にする。

Page Editorでは背景・elements・digital geometryも一致させた。適用前の装飾recommendationをメインへ一時表示する際は、選択中thumbnailへも同じpropsを渡す。layout変更後のeditor frame IDはeffective assignmentに合わせ、contain状態やcrop controlsが旧AI slot IDを参照し続けないようにした。

画像URLへtimestamp queryは追加していない。thumbnail imageを生成し直していない。Production常時diagnostic logsも追加していない。

## Priority 4 — Optimistic / persistence behavior

即時UI更新は既存のoptimistic `applyFrameCrop` / `applySpreadLayout` / `applyFramePhoto` を維持する。

保存成功時は既存RPCと `readDraft` の結果を使う。mergeを全view置換からrowのclientSeq/revision比較へ変更し、別targetの新しいlocal編集を遅い保存応答で消さないようにした。未保存のelement追加・削除もdirty target情報で保護する。異なるdraft versionの応答は採用しない。

RPC rejectionは明示「保存失敗」として保持する。複数targetのfailure/intentsを保持し、別targetの成功で失敗や再試行情報を消さない。古い応答でもDB revisionを単調に記録し、競合後の再試行が古いrevisionを繰り返さないようにした。

Page Editorの「戻る」「完了」はdebounce中の送信とin-flight保存を待ってから遷移する。保存失敗・新しいpending操作があれば遷移しない。reload/close時は未保存状態のbeforeunload警告を設定する。保存済みの表示を更新するため、mutation適用後に対象albumのdetail・edit一覧・print routeをrevalidateする。

active versionが変わった場合はPage Editorをkeyで再初期化する。同じversionの保存応答による不要なlocal state resetは行わない。

## Tests

追加: `tests/task082-preview-thumbnail-state-sync.test.mjs`（12件）。依存packageの追加なし。

- 実際のTSX rendererをSSRし、crop変更がmain/thumbnailのtransformへ同時反映すること
- layout変更後のgeometryとeffective slot IDの一致
- 写真差し替えがthumbnailのsrcへ即時反映すること
- contain/cover、背景色、page elementの表示一致
- 保存rowを再projectionしたreload相当の表示一致
- 別target ACKがpending cropを消さないこと
- 未保存element削除が古い応答で復活しないこと
- 同じPreview sequenceからmainとthumbnailを描くこと
- 実save hookの拒否応答が明示エラーとなり、離脱を止め、再試行できること
- 実save hookのdebounce cropを離脱前にflushすること
- thumbnail clickでmain spreadとselected highlightが共に変わること
- 実 `/edit` server pageがactive draftを読み、`album_photos`から本文再生成しないこと

保存hookとselection testsではReact hook storageとservice応答を制御している。DBのmockはfixture応答であり、実Supabaseへの編集保存やブラウザのroute/cache挙動をE2E検証したものではない。

## Verification

同梱Node 24.19.0をPATH先頭に指定して実行。

- `node --test tests/*.test.mjs`: 1,113 pass / 0 fail（Task081 / Task078回帰を含む）
- `npx tsc --noEmit`: pass
- `npm run lint`: 0 errors / 12既存warnings
- `npm run build`: Next.js 16.4.0 webpack build成功
- `git diff --check`: pass

Task081 subset、Album generation、Safety threshold、Task078 Recovery、No-Crop Registryには変更を加えていない。

## Preview acceptance result

未実施。現在公開中のTask081.1 Previewへ、このTask082.1差分はまだcommit/push/deployしていない。Task081.1での生成成功は今回のUI修正の受入結果として扱わない。

次のPreviewでは、crop/layout/差し替え/背景を編集し、同時thumbnail、戻り後の `/edit` 一覧、Preview、reload後の表示、保存失敗時のエラー・再試行を確認する。ResizeObserverによる縮小表示の実ブラウザ見た目も確認する。ブラウザ固有の戻る操作や複数tab同時編集は別途実操作確認が必要であり、今回のローカル検証だけで完了保証しない。

commit/push/merge/deploymentは実行していない。
