# Task052 — Digital Album Editor Foundation

## 1. Task概要

既存のAlbum Draft Editorを、冊子モック表示ではなく見開き中心のDigital Editorとして動かす基盤を確認・補強した。既存のdraft persistence、crop override、Undo/Redo、print snapshotの構造を再利用し、新しいDB migrationは追加していない。

## 2. 既存Editor調査

- `DraftSpreadView`はdigital表示とbook-mock表示を切り替え、Editor画面はdigital表示を指定する。
- frame配置は既存spread placement、photo位置と倍率は既存`CropTriple`（x/y/scale）を使う。
- `usePageEditDraft`がDB保存とAI値を保持したuser overrideを担当し、`useEditorHistory`が既存の履歴を管理する。
- print previewは別routeでsnapshotを参照する。Editorの表示更新でprint snapshot生成経路は変更していない。

## 3. Mock Background Removal

Digital Editorではblank book画像を描画せず、左右の白いpage surfaceとgutterを表示する。book-mock描画経路とassetは削除せず、Editor以外のpreview向けに残した。

## 4. Spread Canvas

左右pageの矩形とaspect ratioは既存`ALBUM_DRAFT_CONFIG.book`由来の`digitalSpreadGeometry()`を使用する。Editor canvasは最大1300pxで、viewport高に応じて幅を制約する。新しい比率magic numberは追加していない。

## 5. Photo Selection

frame選択は`data-frame-id`を基準とし、選択時にoutlineとcrop toolbarを表示する。空白クリックで解除し、frame領域と写真内容を分離している。

## 6. Pan

frame内pointer dragで既存crop x/yを更新する。今回、開始frameにpointer captureを設定し、move/up/cancelを開始pointer IDに限定した。spread外へdragしても終了イベントを受け取れるようにした。

## 7. Zoom

選択時のrangeと +/- 操作が既存scale値を更新する。既存`sanitizeCropTransform`により非有限値と1〜4外の値を制限し、frameを覆えないscale 1未満を許可しない。layout別maxScaleもrangeに反映する。

## 8. Fit / Fill

Fitはscale 1、FillはframeのSmart Crop maxScaleへ設定する。いずれも既存crop model内で動作し、別mode fieldは追加していない。

## 9. Reset

Resetはuser crop overrideをnullに戻し、DBのAI crop x/y/scaleを再びeffective stateにする。中央cropへの置換ではない。

## 10. Undo / Redo

page editor既存の`useEditorHistory`を利用する。Pan gestureは開始から終了まで1履歴として記録し、Zoom/Fit/Fill/Resetもcrop override変更として扱う。既存のCmd/Ctrl+Z、Cmd/Ctrl+Shift+Zを再利用する。

## 11. Persistence

crop変更は既存`overrideFrameCrop`経由でAlbum Draftへautosaveされ、reload時はAI rowとuser overrideから復元する。DB schema/migration変更はない。

## 12. Digital / Print Separation

Digital Editorはpage surfaceを描画し、print preview/PDFは既存print snapshotと専用routeを維持する。book mock assetはEditorの座標・表示依存から外れている。

## 13. Browser Verification

部分完了。signed-in browserで17枚のmulti-pet album詳細を確認したが、そのAlbum Draft Editor routeは「保存された初稿がありません」と表示した。Wakaの他7 albumのEditor routeも初稿なしだった。

専用Persistence LabでHimeの2026年9月を選ぶと9枚と表示された。grouping前処理はpet全体の12枚（2025年9月3枚、2026年9月9枚）を処理し、月間生成結果は1spread・写真1枚だった。3spread条件未達のためSave Draftは押しておらず、テスト用album/Draftは作成していない。page-editorのPan/Zoom/Fit/Fill/Reset/Undo/Redo/reload、3spread、black frame/crop表示は未確認。

前処理経路は解析結果を`photo_analysis_results`へ保存・更新する場合がある。処理対象12枚のうち新規または更新されたcache row数は照会していない。画面証跡は再生成していない。`docs/album-editor-task052-verify.png`は開始時点から存在する未追跡ファイル。

## 14. Human Review

判定: NEEDS_TUNING。対象Editorに保存済みDraftがなく実操作画面へ到達できなかったため、見開きの大きさ、操作感、UIの邪魔さ、Resetの安心感、crop表示を人手で評価できていない。3spread以上のDraftで再レビューが必要。

## 15. Regression

既存テストスイートにはSmart Layout、5-photo layout、multi-pet selection、draft persistence、print/checkout関連の回帰検査が含まれる。Task052ではalbum generation pipelineとprint snapshot実装を変更していない。

## 16. Tests

`node --experimental-strip-types --test tests/*.test.mjs` — 724 passed, 0 failed。`tests/page-editor.test.mjs` — 22 passed。pointer captureとpointer IDの一致を回帰検査に追加した。

## 17. TypeScript

`npx tsc --noEmit` — 成功。

## 18. Build

`npm run build` — 成功（Next.js production build）。

## 19. Lint

`npx eslint 'app/(app)/pets/[petId]/album/_components/draft-spread-view.tsx' tests/page-editor.test.mjs` — 成功。

## 20. git diff --check

成功。報告書作成前後の最終チェックも実施する。

## 21. git status

開始時点で広範な既存modified/untracked差分があった。すべて保持し、今回の作業では対象コンポーネント、Page Editor test、Task052 reportのみ追加変更した。commit/pushはしていない。

## 22. Known Issues

- Multi-pet albumで生成直後18枚だったものが保存後DB上17枚になった既知事象がある。
- 原因未特定。
- Task052では未修正。
- 今回確認した既存multi-pet albumは17枚だったが、18→17の生成・保存差分を再現する操作はしていない。
- Persistence Labは選択した月の枚数とは別に、grouping用にpet全体の写真を前処理する。Himeの例では月内9枚に対して全12枚が対象になり、生成結果は1spread・1写真だった。3spread確認を満たさないため保存せず、Editor実操作は未完了。
- photo analysis cache rowへの新規保存・更新有無は確認していない。album/Draft persistenceには書き込んでいない。

## 23. commit / push状態

commit / push未実施。
