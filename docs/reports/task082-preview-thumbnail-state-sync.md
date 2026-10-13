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

別route・別tabへlocal stateを複製する新architectureは追加していない。Page Editorの戻る／完了では保存を待ち、再ロード時はDBを読む。表紙Editorは別hookであり、この待機対策は未適用（受入FAILの詳細を後述）。

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

新Previewでの受入を開始したが、表紙写真変更の一覧サムネイル反映がFAIL。全体は受入未完了。以下に配備・ユーザー報告・ログ調査・未確認事項を記録する。

## Preview deployment（2026-10-13）

ユーザーがローカル検証PASSと判断し、現在branchへのcommit/pushとGit Integration Previewを明示承認した。

- Branch: `feature/task081-safe-photo-subset-selection`
- Commit: `50be7246aa6ee416c9e0bd32b7d1f4275ce351db`
- Commit message: `Unify active draft rendering across album previews and thumbnails`
- Commit範囲: 12ファイル、533 insertions / 181 deletions
- Preview: https://uchinoco-5zx2slqdp-tadanokenjis-projects.vercel.app
- Vercel一覧のstate: `READY`
- 一覧metadataの `githubCommitSha` が上記commitと一致
- `githubDeployment = 1`、environment = preview
- 配備直後の作業ツリー: clean

手動deploy、main merge、main push、Production deployは実行していない。Task081.1の旧Preview `uchinoco-683q3y4yp-tadanokenjis-projects.vercel.app` と混同しない。

## Preview acceptanceの経緯と証拠

### 1. 初回のページ一覧サムネイル未反映報告

ユーザーは「アルバム編集した後のページ一覧のサムネイルが画像反映されていない」と報告し、スクリーンショットを提供した。

- スクリーンショット: `/Users/tadanokenji/Desktop/スクリーンショット 2026-10-13 23.11.47.png`
- 画像にある表示: 「ページ一覧（全11ページ）」「1 表紙」、本文5見開き
- 対象album: `226f8d64-40a2-4621-827d-d04f72ca2dea`
- 期待: 編集したcrop/layout/写真差し替えが一覧サムネイルへ反映
- 実際: ユーザーは未反映と報告。ただし画像だけでは変更前後の差分や操作は特定できない

この時点のambient URLは旧Task081.1 Previewだった。read-onlyで直近Previewログを取得したところ、取得範囲では旧ホストの2件のみがあり、最終時刻は23:11:51 JSTだった。Task082.1新Previewへのアクセスログは取得できなかった。新コードは本文ページ数をdraftから計算し、表紙ラベルを「表紙」とするため、画像の旧形式も実行先相違を示唆した。

結論: この初回報告はTask082.1上の不具合と確定できず、実行先の再確認を依頼した。コードは修正していない。

### 2. Production URLの提示

ユーザーは `https://www.uchinoco.app/pets/645f30fe-700f-441c-8878-6658caef0870/album/226f8d64-40a2-4621-827d-d04f72ca2dea/edit` を提示した。

Task082.1はPreviewのみの配備で、Productionへのmerge/deployは実行していないことを説明し、新Previewへ案内した。このURLでの未反映をTask082.1 Previewの受入結果には含めない。

### 3. 新Preview・新albumでの確認開始

ユーザーが新PreviewのページEditor URLを提示した。

- Host: `uchinoco-5zx2slqdp-tadanokenjis-projects.vercel.app`
- Pet: `645f30fe-700f-441c-8878-6658caef0870`
- Album: `38768139-f147-4904-9174-0516bbef4793`
- Page Editor: `/pets/645f30fe-700f-441c-8878-6658caef0870/album/38768139-f147-4904-9174-0516bbef4793/pages/edit`

正しいTask082.1 Previewであることを確認し、このalbumの編集一覧とPreview URLを案内した。新albumの生成条件・Task081診断値については今回のUI受入調査では検証していない。

### 4. 表紙写真変更後、一覧サムネイル未反映（受入FAIL）

ユーザーは正しい新Previewで「表紙の画像変えたけどサムネイルに反映されない」と報告した。

対象URL:
https://uchinoco-5zx2slqdp-tadanokenjis-projects.vercel.app/pets/645f30fe-700f-441c-8878-6658caef0870/album/38768139-f147-4904-9174-0516bbef4793/edit

- 再現手順（ユーザー報告から整理）: 表紙Editorで写真変更 → `/edit`一覧へ戻る
- 期待値: 表紙サムネイルが変更後の写真になる
- 実際値: ユーザー報告では変更が一覧サムネイルへ反映されない
- 判定: 表紙変更のUI同期はFAIL。Task082.1全体の受入完了にはしない
- 変更した写真、保存表示、戻るまでの待ち時間、reload後の結果は未確認
- Codex自身によるブラウザ再現は行っていない

## 表紙FAILのコード調査（修正前）

確認した経路:

`useCoverEditDraft.setPhoto` → local cover更新 → queue → `overrideCover` → `apply_draft_cover_override` RPC → cover row再取得 → local merge

一方、一覧の表紙は `readDraft` で取得したactive versionに対応する `album_draft_covers` を読む。表紙resolver自体は同じactive versionのoverrideを解決する構造である。

本文に追加した保存・route同期対策が、表紙には適用されていない箇所を確認した。

1. `app/(app)/album-draft-service.ts` の `overrideCover` は、RPC適用後に `/edit`一覧・Preview等をrevalidateしていない。本文mutationは `finishWrite` にrevalidationを追加したが、表紙は別return経路である。
2. `cover/edit/cover-edit-screen.tsx` の「戻る」「完了」は通常のLinkで、保存queue/in-flightの完了を待たず遷移できる。
3. `cover/edit/use-cover-edit-draft.ts` は本文hookとは別実装で、Promise rejectionの明示catchがなく、finallyでsavingからsavedへ移る経路が残る。

1と2は今回の症状の有力な原因候補である。3はコード上の追加懸念であり、今回のユーザー操作で発生した証拠はない。保存raceとroute cacheのどちらが実際に起きたかは、現ログだけでは確定できない。

## 表紙FAILのread-onlyログ確認

対象新Previewに限定し、Vercel CLIで直近1時間・最大1,000件のexpanded JSON logsを取得した（取得件数121）。コードやDBは変更していない。

対象albumでは、23:16:27–28 JSTのcover/edit GET、23:17:27 JSTのedit一覧 GET、23:17:35 JSTのpages/edit POST、23:25:33 JSTのcover/edit GET等が記録され、取得した該当requestはHTTP 200だった。

HTTP 200だけではServer Actionの `{ ok: false }`、conflict、staleを区別できない。対象の表紙mutationについてRPCのwriteStatus・新しいuser_photo_id・保存完了を特定できるログは取得できなかった。DB保存成功、保存失敗、変更後写真の永続化はいずれも未確定である。

## A〜Eの受入状況（現時点）

- A `/edit`一覧: 新Previewで表紙写真の反映がFAIL。本文crop/layout/差し替え/reloadの実ブラウザPASSは未確認
- B Preview: main/thumbnailのcrop/layout/contain/background一致、click切替の実ブラウザPASSは未確認
- C Page Editor: 画面URLへの到達は確認。即時thumbnail反映・背景/elements/geometry一致の実ブラウザPASSは未確認
- D 保存: 本文はローカル回帰テストPASS。表紙のpending save待機・cache再検証に未対応箇所あり。今回の表紙DB保存結果は未確定
- E Regression: Task081生成済みalbumの表示・No-Cropの実ブラウザ受入PASSは未確認

ローカルテスト1,113件PASSとPreview受入PASSは区別する。表紙FAILがあるため、全体は受入未完了。

## 次の確認・修正候補（未着手）

- 表紙変更後の「保存済み／保存失敗」表示、戻るまでの操作順、一覧reload後の差を確認する
- 必要なread-only調査で、対象active coverの永続化状態とwrite結果を確認する
- 表紙保存後の対象route revalidation、戻る／完了前のqueue flushと保存待機を最小修正する
- 表紙hookの拒否応答・競合・retryを含む回帰テストを追加する
- 表紙Editor → 一覧 → Preview → reloadで変更写真の一致を再受入する

これらは提案であり、今回の記録依頼では実行しない。ユーザーの「問題時は修正前に報告」の指示に従い、不具合報告後のコード修正・commit・push・deploymentは行っていない。
