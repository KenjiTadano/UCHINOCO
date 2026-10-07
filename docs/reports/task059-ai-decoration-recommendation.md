# Task059 — AI Decoration Recommendation

実施日: 2026-10-02
判定: **実装・自動検証PASS / 認証Browser Human Review未完了**

## 1. Existing Decoration Audit

- Page element catalog: background 6色、stamp 14種、free decoration 5種、font 4種、color 7色。Textはmultilineを含むfree elementとしてsize/font/alignment/color、printTargetを持つ。
- Page Polish catalog: text style 4種、text候補6 slot、decoration motif 7種、位置4 slot、kit 4種（minimal / warm / playful / seasonal）。既存polish decorationはspreadあたりvisible最大3つ。
- Persisted schema: `album_draft_page_elements.element_data` JSONBにfree Text/Stamp/Decorationを保存。Backgroundは既存の`album_draft_spread_backgrounds`でleft/right別にrevision/client_seqを保存。
- Print/digital: free elementsは`print` / `digital-only`を保持。zIndex順で描画し、textは自由resize、stamp/decorationはaspect lock。既存Editorでrotate、resize、duplicate、delete、background変更、選択ができる。
- History: 現在のEditor session内Undo/Redo。page element、backgroundとも同じstackを利用。AI提案を`recommendation` fieldの一つのhistory snapshotとして追加し、1回Undo/Redoする。
- Safe zones: recommendation placementはactive layoutのphoto frames、visible text/decoration、既存page elements、page safe inset、gutterとの矩形交差で候補を除外。最終PDFは既存print quality gateを通る。
- DB migration: 追加なし。AI provenanceは既存JSONB element dataのoptional metadata。

## 2. Recommendation Architecture

- `lib/album-decoration/recommendation.ts`にpure function `recommendAlbumDecoration(context)`を実装。外部API、Vision、caption生成を呼ばない。
- Inputはalbum page role、story type、density、whitespace intent、photo count、既知event/date、撮影日からのseason、album theme、confidence、user element/background有無、safe pages/occupied rects。
- Outputはstyle id、confidence、短いreason、NONE/LOW/MEDIUM budget、既存background tokens、catalog mark、必要時のevent date text案、apply scope。
- Album themeは既存story type、期間内date、event有無から決定的に選ぶ。Tone metadataは保存されていないため`photoTone`は未使用。新規Vision/API callを追加していない。
- `CLEAN`は全recommendation listの先頭で常に残る。confidence < 0.62、未知event/season、空きsafe placementなしではCLEANへfallback。

## 3. Style Presets

- CLEAN: decoration/background変更なし。常に候補に含める。
- WARM:既存warm backgroundと既存small lineを組み合わせる。
- PLAYFUL: everyday STORY向け既存paw stampひとつ。
- SEASONAL: 撮影日から確定できるspring/summer/autumn/winter stampと既存pale background。
- CELEBRATION: 確認済みbirthday/adoption dateに既存stampと日付テキスト案。
- 高密度・Hero・Quietでは余計なmarkを追加しない。HIGH decoration budgetは設けない。

## 4. Role Rules

- HERO: CLEANのみ。
- GRIDまたはdensity HIGH: CLEANのみ。
- QUIETまたはquiet whitespace intent: CLEANのみ。
- STORY: album themeに応じてWARM / PLAYFUL / SEASONALを低予算で提案。
- EVENT: composition metadataのbirthday/adoptionが紐づく場合だけCELEBRATIONを提案。
- INTRO / CLOSING / COVER / virtual TITLE: 原則CLEAN。現在のEditorはpersisted photo spread単位のため、virtual Title/Cover自体へ直接Applyできない。

## 5. Density Budget

- CLEAN/NONEがdefault。全提案はLOW、イベントのみstamp＋日付案をまとめるがHIGHにはしない。
- Gridとhigh-density spreadは追加markなし。Heroはclean。Quietは余白を埋めない。
- WARM/SEASONAL backgroundにはprovenanceを持つ既存small markを必ず組にし、reload後の全削除で背景も戻せるようにする。

## 6. Album Theme

- 同じalbumのstory type/date/event metadata全体から決定的にthemeを選択。既知eventがあるalbumはWARM、日付が同じseasonに揃うalbumはSEASONAL、everyday/same_day中心ならWARM、材料不足ならCLEAN。
- Hero/Grid/Quietはthemeよりrole制約を優先。手動要素または手動backgroundがあればCLEAN以外を返さない。

## 7. Event / Seasonal

- birthday/adoptionはTask058の`compositionPlan`に保存された実metadataのみ利用し、架空dateは作らない。
- birthdayは対象album年へ解決された日付、adoptionは実際の日付を使用。dateがinvalid/unknownならCelebration候補を返さない。
- Seasonは有効な撮影日からのみ判定。未知日付で季節stampを推測しない。
- photo toneは既存保存metadataにないため未使用。写真の明度/色相分析APIは追加していない。

## 8. Collision Safety

- Recommendation mark/date textの候補rectをactive layout frame、existing polish/free elements、gutter、safe page rectと照合。衝突する候補は返さない。
- Print target elementは既存`assessPrintQuality`を通り、text/photo、decoration/photo、safe area、gutter、minimum font、overflow等のblocking issueがあればPDF生成を止める。
- Theme background自体はphotoを覆うoverlayではなく既存page backgroundとしてpreviewし、manual backgroundがあるspreadでは候補適用を抑制。

## 9. User Element Protection

- AI markerは`recommendationId: task059:*`と背景before/afterを既存`element_data`内に保持。reload後もAI由来だけ識別できる。
- manual free elements、既存Text/Decoration override、manual backgroundがあればnon-CLEAN recommendationを表示しない/Apply hookでも拒否。
- 手動でAI markを動かす/編集/duplicateするとprovenance markerを外してuser-ownedにする。AI全削除はmarker付きelementsのみ処理し、current backgroundがAI適用値と一致する場合だけ保存されたbefore値へ戻す。

## 10. Apply / Undo

- Editorに「AIおすすめ」panelを追加。選択したcandidateはまずbook上にlocal previewし、保存しない。「このままでOK」で閉じるか、「提案を適用」を明示して既存page-element/background override APIへ保存。
- CLEANを適用すると既存AI markerだけをclear。手動elementは保持。
- まとめたrecommendation snapshotを既存history stackの1 entryとして扱い、Undo/Redo一回で戻す/再適用。`AI装飾を全削除`はmarker付きだけを消す。
- 保存は既存autosave Server Actions。新しいAI APIやDB migrationなし。

## 11. Browser Verification

- 共有browserを再確認したが`http://localhost:3000/login`でlogin form表示。認証済みsessionは確認できなかった。
- HERO / GRID / QUIET / EVENTを含む認証実Album、Apply/Undo、reload persistence、Print Preview、PDFのBrowser E2Eは未実施。
- UIはlogin route以外を実ブラウザ検証していない。fixture/synthetic testsをBrowser reviewの代わりとは扱わない。

## 12. Human Review

認証済み実Albumを表示できないため、下記はすべてNEEDS_TUNING（未観察）。今回視認したFAILはないが、FAIL=0を確認したとは判定しない。

- A. Photo remains primary: NEEDS_TUNING
- B. Decoration subtlety: NEEDS_TUNING
- C. Theme consistency: NEEDS_TUNING
- D. Event appropriateness: NEEDS_TUNING
- E. Seasonal appropriateness: NEEDS_TUNING
- F. Quiet restraint: NEEDS_TUNING
- G. Collision safety: NEEDS_TUNING
- H. Print readability: NEEDS_TUNING
- I. User control: NEEDS_TUNING
- J. Emotional quality: NEEDS_TUNING

## 13. Print Regression

- Task059はPrintSpecやPDF rendererを変更していない。
- Persisted recommendation elementsは既存print snapshotの`PageElement[]`へ自然に含まれ、digital-only elementは従来どおり印刷対象外。
- synthetic print regression suiteは全件実行・PASS。認証済みPrint Preview/PDFの目視は未完了。

## 14. Tests

- 新規recommendation tests: 8件（CLEAN/低confidence、5 styles、Hero/Quiet/Grid restraint、known event、seasonality/invalid date、user protection、collision、theme determinism）
- provenance/element test: pass（marker JSONB round-trip、no migration）
- history test: pass（recommendation compound Undo/Redo）
- Editor structural test: pass（preview non-mutation、Apply、CLEAN/reset、user protection）
- 全suite: PASS（804 / 804）

## 15. TypeScript

- `npx tsc --noEmit`: PASS

## 16. Build

- `npm run build`: PASS（Next.js 16.3.5 / webpack）

## 17. Lint

- 変更範囲`npx eslint`: PASS（0 error / 0 warning）

## 18. git diff --check

- `git diff --check`: PASS

## 19. Known Issues

- 認証済みbrowserがlogin画面のため実Albumのrole/appearance、user-protection、Apply/Undo/Reload/Print/PDFを目視していない。
- COVER/virtual TITLE pageは現在のphoto-spread editor外。提案はpersisted spread単位であり、virtual Title自体への適用は対象外。
- photo tone metadataは未保存なので推薦材料に使わない。
- Recommendation metrics（shown/previewed/applied/rejected）はDB migration禁止と原則なしに従って計測/保存しない。
- `globals.css`の`get_errors`には今回無関係の既存Tailwind shorthand diagnosticsが出る環境だが、変更範囲lint/buildはPASS。

## 20. commit / push

- commit: 未実施
- push: 未実施
- DB migration: 追加なし
