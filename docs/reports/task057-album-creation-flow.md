# Task057 — Album Creation Flow + Quality Benchmark

## 1. Existing Flow Audit

Before:

- Home Quick Action / Album list Hero からAlbum creation formへ移動。
- ペットはrouteから事前選択、期間は「最近3か月」が既定だが、ペット・期間のradio groupを最初から表示。
- 手動写真選択とlayout選択はなかった。写真候補・並び・layout/cropは一部AI pipelineへ委任されていた。
- 生成ボタンのあとloading screenを経て完成画面へ移動。完成画面の主CTAはPreview、編集は別導線。
- Album listの誕生日・お迎え日・年間提案は、各metadataを期間選定に反映せず同じWizardへ遷移していた。

After:

- Home / Album listに保存済みAI Draftがあれば候補として表示し、完成画面から確認する。
- 新規作成ではpetと「最近3か月」を既定にし、変更欄を閉じた状態にする。
- 通常操作は「作成開始 → AIにおまかせで作る → このままでOK」の3クリック。開始・確認以外の必須選択はない。旧導線もpet/periodは既定値で選択操作不要だったため、クリック数は同程度だが判断欄を初期画面から外した。
- 写真、Story、Best Shot、page allocation、layout、cropは既存Task051–055 pipelineへ委任。編集と印刷確認は完了後の任意導線。

分類:

- 必須: 対象petはrouteで確定。写真がない場合のみ写真追加が必要。
- 任意: 対象期間、複数petの選択。
- AI: 写真選定、Story grouping、Best Shot、layout、crop、cover photo。
- 後から変更: 写真、crop、layout、text、stamp、decoration、background。

## 2. New Creation Flow

- 作成フォームの期間とpet設定を`details`にまとめ、既定状態を閉じる。
- 生成中は既存のloading screenを利用し、新しい非同期基盤は導入していない。
- 単一petではStory/Layout Draftを生成し、選定写真を`album_photos`へ保存、既存`save_album_draft_version` RPCでlayout/crop/rankingを保存する。
- 生成後にAI cover rowを既存`loadCoverEditor`で初期化する。表紙写真は最初のHero assignment、fallbackは先頭の選定写真。
- Migrationは追加していない。

## 3. AI-first Experience

- Homeの保存Draft Hero/sectionおよびAlbum listの候補Hero/cardを「アルバムを確認する」から完成画面へ接続。編集リンクは副導線。
- Album listには保存Draftを「AI初稿」と表示して先頭へ並べる。
- 写真・Story・Smart Crop・layoutは既存server pipelineを再利用し、新しいAI model/endpointは追加していない。
- Smart Cropの保存済み解析がない写真では、既存の`analyzeSmartCropPhoto`経路がVisionを呼ぶ場合がある。cache miss時の既存API callは残る。
- Background jobは作成していない。生成はユーザー操作起点。

## 4. Album Quality Benchmark v1

- 指定のしまうまプリント実物アルバムは、このworkspaceに画像/PDF素材が見当たらず比較できなかった。
- `docs/file.jpe`はTask050.5の5-photo layout比較画像で、実物アルバムではない。
- Benchmark条件は本書のHuman Reviewで評価し、参照素材がないため`BENCHMARK PASSED`とは判定しない。

## 5. Required Layout Baseline

既存Task054 Grammar v1 / Task055 Smart Layout v2を再利用。Task057でlayout IDは追加・変更していない。

- 1 photo: L01/L01b等のHero候補とcaption/余白対応候補。
- 2 photos: Equal、Story、Large+Small候補。
- 3 photos: Hero+2、Equal、Editorial候補。
- 4 photos: 2x2 Grid、Hero+3、Editorial候補。
- 5 photos: Hero+4、balanced Grid、mixed orientation候補。
- legacy layout IDとsaved alternative rankingの互換性を維持。ランキングがないlegacy draftにfake scoreは表示しない。

## 6. Album Rhythm

- Task050.3 rhythmとTask055 v2 rankingを維持。crop tierをrhythmで逆転させず、same layout/family、density、hero streakに既存penaltyを適用する。
- 既存の5-photo実写真レビュー画像ではHero系が連続した後にdense Gridへ移るcaseが残る。strong candidateを壊さず全ケースのfamily反復を抑える改善は未完了。

## 7. Story Sequence

- `buildPetAlbumStory`から既存`same_day`、`sequence`、`event`、`everyday`等を受け取り、story spreads順にassignmentを保存する。
- 実在しないevent/locationは追加しない。manual photo orderingは初期生成前に求めない。

## 8. Crop Quality

- 既存Smart Crop、Frame Match、STRICT > FALLBACK > UNUSABLE tierとhero safetyを維持。
- fallback penaltyとweak photo handlingはTask050/055の既存選定を利用。
- Task055.2の実写真レビューでは一部2–4 photo casesがfallback crop。品質面の追加tuning対象。

## 9. Whitespace

- Grammar metadataのwhitespace intent、caption support、safe zonesを維持。Task054 templatesのQuiet/Editorial候補を保持。
- Task057ではQuiet/text pageを自動挿入していない。写真のないページを新たに捏造しない。

## 10. Cover / Intro / Event Pages

- coverは選定Hero photo、AI title、pet name、期間でphoto-firstに初期化。自動Decorationは追加しない。
- cover/complete/editor/printで開始月〜終了月を共通formatter表示に統一。例: `2026.07-10`。
- Intro-only page、birthday/adoption event pageは今回自動生成していない。確実なmetadataを表示する別設計が必要。

## 11. Completed-first UX

- 完了画面のPrimary CTAを「このままでOK」に変更。
- 完成画面のgeneric fabricated highlightsを削除し、写真枚数・思い出数・表紙写真だけを表示。
- 保存Draftがある場合、Previewはlegacy synthetic spreadではなくpersisted layout/crop/elementsを描画する`DraftSpreadView`を使用。

## 12. Optional Editing

- 完了画面に「少し編集する」と「印刷を見る」を追加。何も編集せずViewer/Print Previewへ進める設計。
- 既存のcrop/zoom/pan/swap/text/stamp/decoration/background/layout Editorは維持。

## 13. Acceptance Flow

- UI上の「このままでOK」をViewer遷移として追加。
- acceptance event/Album Accept Rateの永続計測は行っていない。新規migrationを避けたためKPI計測schemaは未実装。

## 14. Picker / Alternatives

- `buildDraftSavePayload`へselected layoutと既存alternatives/ranking metadataを渡す。
- Editorはsaved rankingがある場合のみAI順位を利用。legacyにfake scoreは付けない。
- 「別のテーマで作り直す」はPrimaryから外し、pet/periodを変えて作る控えめな導線に変更。

## 15. Browser Verification

- 認証済みBrowserで既定pet/最近3か月、閉じた調整欄、AI生成CTAを確認。
- 実写真4枚のsingle-pet生成を実行し、server actionから完成画面へredirect。完了dataは4 photos / 1 memoryで、HomeにAI候補とViewer/Edit導線が表示された。
- Provider注文、checkout、決済、production orderは実行していない。
- その後の通常GET/Reloadで`/album/[albumId]?view=complete`、`?view=preview`、`/pages/edit`、Album listが共通のloading stateのまま応答しなかった。これはDev/Production双方で再現。Homeと作成画面は描画した。`readDraft`の独立5-table readsを並列化したが解消しなかったため、通常GETの完成Viewer/Editor E2E、accept→edit→back→reloadは未完了。
- 実Browserの1/3/5-photo比較、PDF runtime generation、Print Preview視覚確認は未完了。既存fixture/Task055.2のテスト・レポートを参照。

## 16. Benchmark Human Review

総合: **NEEDS_TUNING**。しまうま実物との直接比較ができず、基準を満たしたとは判定しない。

- A Hero clarity: ACCEPTABLE。cover assignmentはHero roleを優先し、実生成完了画面で表紙写真を確認。
- B Crop quality: NEEDS_TUNING。既存実写真レビューにfallback cropと耳/顔安全の調整caseあり。
- C Layout variety: NEEDS_TUNING。既存5-photo実写真画像でHero系が連続するcaseを確認。
- D Whitespace: NEEDS_TUNING。Heroの白場は十分だが、Quiet/text pageの実印刷評価は未実施。
- E Page rhythm: NEEDS_TUNING。Hero/Grid間の緩急は既存rhythmで評価するが、実caseに反復が残る。
- F Story coherence: ACCEPTABLE。既存Story groupingを利用し、fake eventは追加しない。
- G Print readability: ACCEPTABLE。PrintSpec regression testsとTask055.2実PDF検証はpass。今回DraftのPDF runtime browser確認は未完了。
- H Photo prominence: ACCEPTABLE。cover photo-first、hero roleを維持。
- I Event/text page: NEEDS_TUNING。title/coverはあるがevent/title-only pageを生成していない。
- J Emotional quality: NEEDS_TUNING。しまうま実物とのHuman comparison素材がない。

## 17. Print Regression

- Existing `ALBUM_PRINT_SPEC`を維持: PDF canvas 154 × 216 mm、trim 148 × 210 mm、bleed 3 mm each edge。
- PDF renderer、snapshot、storage経路に変更なし。PrintSpec/album-print testsはpass。
- Provider注文を行わず、Task055.2の既存実PDFレポートを再利用。

## 18. Egress

- Album list/Homeはthumbnail-preferred image deliveryを維持。candidate cardはcover thumbnailを再利用。
- Editor候補は既存thumbnailを優先。Print rendererだけoriginalを扱う方針を維持。

## 19. Tests

`node --experimental-strip-types --test tests/*.test.mjs`: **783 passed / 0 failed**。

- Creation defaults / optional controls、single-pet Draft payload、Home/Album candidate導線を追加検証。
- Persisted layout/crop/ranking round-tripとreadDraft query batchingを検証。
- Smart Layout, Album Draft rhythm, Page Editor, PrintSpec回帰を実行。

## 20. TypeScript

`npx tsc --noEmit`: PASS。最終`npm run build`内のTypeScript checkもPASS。

## 21. Build

`npm run build`: PASS（Next.js 16.3.5 / webpack）。Rosetta 2警告あり。

## 22. Lint

Task057変更範囲Lint: error 0。Album shelfの既存`<img>`に対するwarningが2件残る。

## 23. git diff --check

最終確認: PASS。

## 24. Known Issues

- Album detail / Viewer / Editor / Album listの通常GETがDevelopment/Production双方でloading stateのままになり、Browser E2Eが未完了。Homeとcreation actionのredirectは動作。
- しまうま実物アルバムの参照素材がなくMinimum Benchmarkを直接評価できない。総合判定はNEEDS_TUNING。
- Browser実写真は4-photoのみ。1/3/5-photo human comparisonは既存fixture/Task055 artifactsに限定。
- 複数petでは既存Draft frame owner guardがanchor pet以外の写真を拒否するため、今回persisted Smart Layout Draftを保存しない。既存multi-pet album pathは維持。
- Smart Crop cache missでは既存Vision API callが発生する場合がある。新しいendpoint/modelは追加していない。
- Acceptance rateの永続計測、Quiet/intro/event page自動生成、強いHero repeat抑制は未実装。

## 25. commit / push

commit / pushは実施していない。DB migration、provider production order、checkout/paymentも追加・実行していない。既存の未コミット差分は保持。
