# Task054.2 — Album Template System

## 1. Existing Layout Audit

既存カタログには L01〜L20 の連番20件ではなく、`L12` を除く19件（`L01b` を含む）が存在する。すべてのIDを保存互換対象として残した。

| ID | 写真/枠 | Family / 主な向き | Hero | Crop・余白・Print | 判定 |
|---|---:|---|---|---|---|
| L01 | 1/1 | Hero / 横 | あり | 低〜中 / 大写真 / safe | KEEP |
| L01b | 1/1 | Hero / 縦 | あり | 中 / 大写真 / safe | REDESIGN |
| L02 | 2/2 | Story / 縦2枚 | なし | 中 / balanced / safe | KEEP |
| L03 | 2/2 | Story / 横2枚 | なし | 低 / balanced / safe | KEEP |
| L04 | 3/3 | Story / Hero+2 | あり | 中 / balanced / safe | KEEP |
| L05 | 3/3 | Equal / 縦3枚 | なし | 中 / balanced / safe | KEEP |
| L06 | 4/4 | Story / Hero+3 | あり | 中 / dense / safe | KEEP |
| L07 | 4/4 | Grid / 2×2 | なし | 中 / dense / safe | KEEP |
| L08 | 3/3 | Story / asymmetric | あり | 中〜高 / editorial / safe | LEGACY |
| L09 | 3/3 | Editorial / portrait detail | あり | 中 / editorial / safe | KEEP |
| L10 | 2/2 | Grid / square | なし | 高 / balanced / safe | LEGACY |
| L11 | 3/3 | Story / portrait hero | あり | 中 / balanced / safe | KEEP |
| L13 | 5/5 | Story / left hero | あり | 中 / dense / safe | KEEP |
| L14 | 5/5 | Grid / balanced | なし | 中 / dense / safe | REDESIGN |
| L15 | 5/5 | Story / top hero | あり | 中 / dense / safe | KEEP |
| L16 | 5/5 | Story / right hero | あり | 中 / dense / safe | KEEP |
| L17 | 5/5 | Story / 2+3 | 弱 | 中 / dense / safe | KEEP |
| L18 | 5/5 | Editorial steps | あり | 中〜高 / dense / safe | KEEP |
| L19 | 5/5 | Center hero | あり | 中 / dense / safe | KEEP |
| L20 | 5/5 | Grid / 2+3 | なし | 中 / dense / safe | KEEP |

既存レイアウトはテンプレート自身にText Slotを持たない。Task053の自由テキスト・装飾・背景は別レイヤーとして維持される。

## 2. Layout Grammar

`uchinoco-layout-grammar-v1` を定義した。写真テンプレート36件、見開き8件、文字のみ5件、合計49件。P系は現行Editorの見開き正規化座標へ接続し、S/T系は次段階で利用できる独立カタログとした。

## 3. Template Model

`scope`、`composition`、`orientationAffinity`、`heroAffinity`、`density`、`whitespaceIntent`、`captionSupport`、`decorationSafeZones`、`printSafe`、`legacyStatus` を追加した。既存定義は `withTemplateMetadata` で同じモデルへ正規化される。

## 4. Photo Slots

既存の `frames` を互換Photo Slotとして使用し、`preferredOrientation` と `cropTolerance` を追加した。既存の `slotRole`、`importance`、正規化rectはそのままSmart Crop / Frame Matchへ渡る。

## 5. Text Slots

既存の `textSlots` をTemplate Text Slotとして利用する。Caption Bottom / Side Text等の新規テンプレートでは写真枠と重ならないrectを定義した。Task053 User Text Elementとは別レイヤーである。

## 6. 1-photo Templates

6件。既存L01/L01bに、Full Bleed、Centered Landscape、Caption Bottom、Side Textを追加。

## 7. 2-photo Templates

6件。既存3件に、Large+Small、Portrait+Landscape、Pair+Captionを追加。

## 8. 3-photo Templates

8件。既存5件に、Hero Bottom、Hero Right、Landscape Stackを追加。

## 9. 4-photo Templates

8件。既存2件に、Hero Top/Right/Left、Equal Columns、Editorial、Captionを追加。

## 10. 5-photo Templates

8件。Task054で追加・再評価したL13〜L20を維持した。

## 11. Spread Templates

Full Hero、Left Hero Story、Right Hero Story、One+Four、Two+Three、Timeline、Editorial Asymmetric、Quietの8件を定義した。現時点では自動生成へ接続せず、将来のTask055候補として保持する。

## 12. Text-only Templates

Center Short / Center Long / Top / Bottom / Editorial Verticalの5件を定義した。UIへ積極表示していない。

## 13. Whitespace Strategy

`none / balanced / editorial / quiet` を意味付きで保持する。QuietとEditorial以外は大きな空Text領域を候補化しにくいmetadataとした。

## 14. Orientation

`portrait / landscape / square / mixed / any` をテンプレートと各Photo Slotへ保持する。候補filterは入力写真のdominant orientationと一致するfamilyを優先する。

## 15. Hero

既存 `computeHeroConfidence` を再利用し、明確なHeroがある場合はHero系、差が小さい場合はEqual/Grid系を候補filterで優先できる。

## 16. Caption

Captionありでは `prominent` を加点し、Captionなしでは大きなText Slotを持つ候補を減点する。現行Smart Layoutの最終score順は回帰防止のため変更していない。

## 17. Decoration Safe Zones

upper-right / bottom-left候補から写真枠と交差しない領域だけを公開する。User Decorationの自動移動・削除は行わない。

## 18. Picker UX

現在のレイアウトを「おすすめ」として先頭表示し、初期表示は4候補、`すべて見る` で全候補へ展開する。内部Lxx/Pxxを強調せず、人が読める名称と「写真大きめ / バランス / 余白あり / 文字あり」を表示する。thumbnailは実frame rectとText Slot rectを描画する。

## 19. Legacy Compatibility

`LEGACY_TEMPLATE_MAP` に既存19 IDを登録した。既存DBのlayout ID、AI layout、user overrideはrenameせず、そのまま解決される。`L12` は実装履歴に存在しないため新規に捏造していない。

## 20. Smart Layout Integration

`filterTemplateCandidates` を追加し、photoCount → orientation → heroConfidence → caption presenceで最大候補数を絞れる基盤を用意した。既存の最終選定へはまだ強制接続せず、Frame Match等の回帰を防いだ。Task055で段階導入する。

## 21. Browser Verification

ローカル `/dev/smart-layout` を開くと認証ガードにより `/login` へ遷移した。テスト用認証情報を使用していないため、実アルバムEditorでの1〜5枚Picker目視は未実施。実geometry・候補数・写真枠数・Text Slotは自動テストとproduction buildで確認した。

## 22. Human Review

| 対象 | 評価 | 所見 |
|---|---|---|
| 1-photo Hero | OK | Full / centered / portraitの差が明確 |
| 1-photo Caption | OK | Text Slotは写真と非重複 |
| 1-photo Quiet | ACCEPTABLE | 実写真で余白量の最終確認が必要 |
| 2-photo Equal | OK | 縦・横・squareを選択可能 |
| 2-photo Story | ACCEPTABLE | Large+Smallの小枠cropを実写真で確認予定 |
| 3-photo Hero+support | OK | 上下左右のリズムを確保 |
| 3-photo Equal | OK | portrait / landscape双方あり |
| 4-photo Grid | OK | 2×2と縦columnを分離 |
| 4-photo Hero | OK | top/left/rightを選択可能 |
| 5-photo Hero | OK | L13/L15/L16/L19で対応 |
| 5-photo Editorial | ACCEPTABLE | L18の余白・cropは実写真で要確認 |
| 5-photo Equal | OK | L14/L20で対応 |
| Spread Hero | NEEDS_TUNING | 顔のノド跨ぎ判定はTask055対象 |
| Spread Story | ACCEPTABLE | PrintSpec座標での最終目視が必要 |

## 23. Regression

既存Smart Layoutの選定関数は変更せず、Task053 Editor、Smart Crop、PI、Best Shot、Story、Rhythm、Multi-pet、Print/PDF/Checkoutを含む全テストを実行した。

## 24. Tests

`node --experimental-strip-types --test tests/*.test.mjs`: 747 passed / 0 failed。新規テストで件数、slot数、unique ID、geometry、Text Slot非重複、safe zone、legacy mapping、orientation/hero/caption候補を検証した。

## 25. TypeScript

`npx tsc --noEmit`: 成功。

## 26. Build

`npm run build`: 成功。既知のRosetta 2 performance warningのみ。

## 27. Lint

Task054.2変更範囲のESLint: 成功。

## 28. git diff --check

成功（後述の最終検証時点）。

## 29. Known Issues

- 認証済みの実データを用いたBrowser目視は未実施。
- Spread Full Bleedの顔・耳とノドの安全性は、Task055の候補評価へ接続する必要がある。
- S/Tカタログは定義済みだが現行自動生成・Pickerには未接続。
- L01b/L14はREDESIGN、L08/L10はLEGACYとして残し、既存永続データ互換を優先した。

## 30. commit / push

commit / pushは実施していない。
