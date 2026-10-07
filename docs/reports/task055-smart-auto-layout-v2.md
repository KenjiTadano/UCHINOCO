# Task055 — Smart Auto Layout v2

## 1. Existing Pipeline Audit

現行処理は、写真枚数による候補取得、全割当 permutation、Smart Crop、Frame Match、Role、Balance、Variety、Crop Quality、Orientation、Hierarchy、Hero confidence、Story、Album Rhythmの順で構成されていた。Task054.2のGrammar metadataと`filterTemplateCandidates`だけが本番選定から未接続だった。

今回、`photoCount hard filter → Grammar v1 semantic shortlist → 既存Task050評価 → Strict/Fallback/Unusable tier → v2 soft score → stable ID tie-break`へ接続した。shortlistにStrict候補がないときだけ同一写真枚数の残候補を評価する。

## 2. Candidate Filtering

`rankTemplateCandidates`を追加し、orientation、hero confidence、caption、story compositionを理由付きで順位化した。既存L系候補は互換性のためshortlistへ残す。写真枚数はhard filter、それ以外はsoft preferenceである。crop viabilityは既存評価後に判定し、Strictが無い場合だけ候補を拡張する。

## 3. Orientation

`buildOrientationProfile`と`orientationAffinity`を利用する。exact match、mixed/any、mismatchをdebug値として公開した。Task050ですでにOrientationが本スコアへ入るため二重加点はしない。

## 4. Hero / Best Shot

既存`computeHeroConfidence`、Task050.2のHero assignment、Best Shot、face/head/ear/crop safetyを維持した。Hero candidateがStrict hero slotへ入らない場合はHero適合を正評価しない。既存Hero scoreと二重加点しない。

## 5. Crop Safety

Strict > Fallback > Unusableのtierを最上位ソート条件として維持した。候補絞り込みでStrictが見つからなければ残候補を評価する。既存Album Draft gateのface/head/ear、subject scale、extreme crop、gutter checksを変更していない。

## 6. Caption

`LayoutPhotoInput.captionAvailable`とselection contextを追加した。Captionありはprominent templateを小さく加点、Captionなしはprominent templateを減点する。ユーザーTextや保存済みCaptionデータは変更・削除しない。

## 7. Story

Story typeをcandidate rankingとv2 scoreへ渡した。singleはhero、sequence/same_dayはstory/editorial、contrastはequal/grid、eventはhero/story、everydayはquiet/editorial/gridをsoft preferenceとする。Story contextがない呼出しはTask050の既存scoreへfallbackする。

## 8. Rhythm

既存のlayout ID、family、Story density、hero streak、orientationに、composition、template density、whitespace intentを追加した。同一compositionとdenseの連続を抑え、異なるcompositionとdense後のquiet/editorialを小さく加点する。tierを跨がない。

## 9. Whitespace

Grammar metadataの`whitespaceIntent`だけを利用し、単なる空き領域からquietを推測しない。`quiet`/`editorial`はdense streak後のリズム調整にだけ利用する。

## 10. Spread Safety

`spreadTemplateCrossesGutter`と`automaticSpreadTemplates`を追加した。中央48–52%を跨ぐphoto slotを持つSpreadは自動候補subsetから除外する。`S_HERO_FULL`など危険な候補は除外され、安全な左右分離型が最低1件以上残ることをテストした。Album Draftでは既存`placeFrames`と`GUTTER_CROSS` hard gateも維持する。

## 11. Score v2

説明値はTemplate family、Orientation Fit、Hero Fit、Caption Fit、Story Fit、Crop Tier、Spread Safety、Template Affinity、Final Score。Task050本スコアを壊さないため、新規加点はCaption/Story/Spread Safetyのみ最大±6。Orientation/Hero/Cropは既存エンジンに含まれるためdebugのみで二重加点しない。Album Draftの既存density/story/support/rhythmへTemplate Affinityを加えた。

## 12. Determinism

乱数は使用しない。同一tier、同一scoreの最終tie-breakは`layoutId.localeCompare`。candidate rankingもscore後にstable IDで固定した。

## 13. Manual Override

Editorの`aiLayoutId`、effective `layoutId`、`layoutOverridden`を変更していない。自動選定は新規Draft生成側だけで、ユーザー選択を自動的に戻さない。計測基盤として`aiLayoutId`、effective layout、override flagからAI選択・ユーザー選択・変更有無を判定可能で、migrationは不要。

## 14. Photo Assignment

既存assignment engineを再利用する。同一写真重複なし、frame数一致、Best Shotの安全なHero優先、deterministic assignmentを維持した。

## 15. User Element Preservation

Task053.2の`reassemblePersistedSpread`を変更していない。layout/crop/photo/preview URL変更後もText、Stamp、Decoration、Backgroundを再結合するテストが成功した。Captionデータもtemplate変更時に削除しない。

## 16. Picker Ranking

Editorは現在のAI layoutを「おすすめ」として先頭表示し、同じframe countの全候補を保持する。候補ごとのAI score/alternativesは永続化されていないため、Picker先頭4件を正確なAI score順にする変更はこのTaskでは行っていない。虚偽のscore順を作らず、後続でalternativesをeditor payloadへ渡す必要がある。

## 17. Browser Verification

未完了。開発サーバーは実行環境のport bind制限（`listen EPERM`）で起動できず、Computer Use権限も未許可だったため、認証済み実ブラウザへ到達できなかった。コード・型・build・自動テストによる検証は完了。

## 18. 5-photo Verification

L13〜L20の8候補すべてについて、5 unique frames、5 unique assignments、landscape/portrait/mixed、Hero、Equal、weak fifth photo、strict tier順を自動テストで確認した。ブラウザでの6回manual switchは未実施。

## 19. Spread Verification

gutterを跨ぐSpreadの自動除外と、Album Draftの`GUTTER_CROSS` hard gateを自動テストで確認した。実写真によるPrint Preview/PDF比較はブラウザ制約により未実施。

## 20. Task053 Final Verification

DB由来spreadの再構築、Editor派生更新、Text/Stamp/Decoration/Background保持は自動テストで成功した。認証済みブラウザでのDB→Editor→spread移動→reload→Print Preview→snapshot→PDFの一気通貫確認は未完了のため、Task053のHuman E2E完了判定は保留。

## 21. Human Review

自動fixture上では1-photo Hero、2-photo Equal、3-photo Story、4-photo Grid、5-photo Hero/Equal、Caption、Spread safetyはいずれも安全条件を満たす。写真が主役、Crop safety、リズムの評価は`ACCEPTABLE`。実画像の白場・自然さ・「AIがよしなに作った」感は認証済みブラウザ未確認のため`NEEDS_TUNING / REVIEW REQUIRED`。

## 22. Performance

同じfixtureを50回評価した平均（ローカルNode、warm run）：1枚=6候補/1.51ms、3枚=7候補/3.89ms、5枚=8候補/11.03ms。全49 templateのbrute forceは行わず、写真templateをphotoCountでhard filterし、semantic shortlistだけを通常評価する。

## 23. Regression

要件A–Wのうちphoto count、portrait/landscape/mixed、hero confidence、caption、story、tier、rhythm、density、whitespace、gutter、manual override構造、user elements/background、5-photo保持、determinism、L01–L20 compatibilityを自動検証した。実ブラウザに依存するmanual switchとPDF visual checkは未完了。

## 24. Tests

`node --experimental-strip-types --test tests/*.test.mjs`: 752 passed / 0 failed。Nodeの既存`MODULE_TYPELESS_PACKAGE_JSON` warningあり。

## 25. TypeScript

`npx tsc --noEmit`: PASS。

## 26. Build

`npm run build`: PASS（Next.js 16.3.5 / webpack）。既存Rosetta 2 performance warningあり。

## 27. Lint

変更範囲への`npx eslint ...`: PASS。

## 28. git diff --check

PASS。

## 29. Known Issues

- 認証済みブラウザ、5-photo manual switch、Spread Print Preview/PDF、Task053 end-to-endは環境制約により未確認。
- PickerでAI score上位4件を正確に表示するには、Draft alternativesのscoreをEditor payloadへ渡す追加設計が必要。
- Caption contextは型と選定経路へ接続済みだが、実データ生成元が`captionAvailable`を渡さない場合はStory contextのみで選定する。
- Safe Spread subsetは候補化APIまで。既存のphoto layout rendererと異なるgeometry型であるため、自動Draftへの直接混在はしていない。

## 30. commit / push

実施していない。
