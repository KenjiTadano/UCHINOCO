# Task055.1 — Smart Layout Browser Validation & Ranked Alternatives

## 1. Scope

Task055 Smart Auto Layout v2の採点・tier・rankSpreadLayoutsは変更していない。新しいAI API呼び出し、DB migration、commit、pushは行っていない。候補metadataは既存の`album_draft_versions.generation_metadata` JSONBに格納する。

## 2. Ranked Alternatives

- `buildSpreadDraft`は既存`rankSpreadLayouts`が決めた候補順と`item.score`を維持し、採用layoutと上位3 alternativesへ搬送する。
- 保存する値: layout id、既存統合rank score、Smart Layout v2 final score、tier、composition、orientation/hero/caption/story fit、既存warning/reject reason。
- `buildDraftSavePayload`はspread story idをkeyに`metadata.layoutRankings`へ格納し、既存save RPCがJSONBをそのまま保存する。`readDraft`がsame keyでSpread viewへ戻す。
- `draftSignature`にも選択layoutとranked score metadataを含め、同じ写真/layout/cropでもrank情報が追加・変更されたpayloadがsave RPCのsignature一致早期returnで捨てられないようにした。
- Pickerは同じphoto countの候補だけを表示する。rankingがある場合はAI選択、次点、次々点、第4候補の順にし、その後に未ranked catalog候補をstable orderで表示する。
- metadataがないlegacy draftは現在layoutを先頭に残し、その後は既存catalog orderとする。AI rank/scoreは表示しない。虚偽のscoreは作らない。
- diversity補正は適用していない。rank scoreをそのまま見せ、AI #1を変更しない。
- Draft-onlyの2-photo layouts L12/L12bもPicker catalogへ含めた。

## 3. Browser Verification

既存3001 dev serverに干渉しないよう、コピーしたsourceからisolated Webpack dev server（3003）を起動し、ログイン済みBrowser sessionで操作した。新規生成・解析は行っていない。

現在の未注文Draft `AI Draft Lab 2026-04` は4spread、写真枚数は1/1/1/5。既存generation metadataに`layoutRankings`がないためBrowserで確認したPickerはlegacy fallbackだった。1-photoでは現在のHeroが先頭、AI score badgeなしを確認。DBにscore-bearing saved draftがなく、真の実score順を実データで表示するBrowser確認は未実施。逆順score fixtureを使ったEditor testではAI Top4 orderとscoreを確認した。

2-photoの保存Draftは注文済み・lockedでEditor routeは404となり、編集しなかった。3-photo/4-photoの未注文saved spreadは見つからなかった。

## 4. 5-photo Verification

5-photo spreadでPickerを展開し、L13〜L20の8候補が表示されることを確認。L13/L15/L16/L17/L18/L19へ6回切替後、全候補で以下を確認した。

- 5 photos / 5 unique photo ids / 5 unique frame ids
- すべての画像がloaded、frame geometryがfinite
- layout選択状態が切替先と一致
- Text/Stamp/Decoration、左右Background、Cropがlayout再構築後も保持
- AI layout L14へReset後、保存状態はsaved

## 5. Task053 Final E2E

同じBrowser sessionで5-photo spreadへ日本語複数行Text、Heart Stamp、Ribbon Decoration、左右別Background、Photo Crop=1.10を保存。L13へ切替後も3要素・5 photos・背景・Cropが保持され、AI layout L14へ戻せた。spread移動後のreloadでもText/Stamp/Decoration、背景、Cropが復元された。

Print Preview上にも検証Text/Stamp/Decorationが表示された。PDF作成を試したが画面に「PDFを保存できません」と表示された。その時点の最新snapshotは4 spreadsとprint対象要素を含む一方、`pdf_path`と`content_hash`はnullだった。対応するStorage objectがないことを確認し、この検証で作られた未finalize snapshot rowは後続cleanupで削除した。bucket上限は50 MiBで、元画像合計は約24.6 MBだったが、失敗の詳細ログは得られず原因は特定できていない。正式なPDF E2E完了とは判定しない。

検証後に追加したText/Stamp/Decorationをsoft-deleteし、left/right Backgroundをunset、CropをAI値へ戻した。最終DB確認ではactive test elementなし、spread 7–8の明示backgroundなし、crop/photo overrideなし。既存Star/Autumn Stampとspread 1–2の元Crop overrideは保持した。

## 6. White Space / Human Review

判定: **NEEDS_TUNING**。

1-photo spreadは既存Hero表示、5-photo spreadは8 layout候補と5枚維持を確認した。Browserで3-photo spreadの保存例がなく、Hero/Equal/Storyの白場、caption area、Best Shotの見え方を実写真で比較できていない。5-photoの全候補geometryとimage loadは正常だったが、AI score-bearing draftがなく「おすすめ」の納得感は評価保留。PDF保存失敗もあるため、写真が主役か・Cropと装飾の仕上がりについて最終OK判定は出さない。

## 7. Print Ratio

`ALBUM_PRINT_SPEC`はtrim 148×210 mm、PDF page 154×216 mm、bleed 3 mm。spread geometryは既存page geometryを使用し、unit testでeditor page aspectとPrintSpecのtrim aspect一致を検証している。今回のPDF保存が失敗したため、実ファイルのvisual/ruler比較は未完了。

## 8. Network / Egress

Authenticated pet timelineを1回開き、ブラウザーDOMでloadedだったStorage images 18件を分類した。

- `pet-photo-thumbnails`: 12 objects、Storage metadata合計351,548 bytes（約0.35 MB）
- `pet-photos`: 4 objects、合計12,454,224 bytes（約12.45 MB）
- `pet-avatars`: 2 objects、合計67,528 bytes（約0.07 MB）
- `performance` APIのtransferSize/encodedBodySizeはcross-origin timing制限により0。実Network transferred MBは取得できていないため、上記はloaded objectのmetadata合計で、転送実測値ではない。
- 5-photo Editorでは5 images loaded。3つはthumbnail/preview bucket、2つはlegacy original fallbackだった。Picker/Gridはthumbnailを優先するが、通常UIにoriginal fallbackが残るlegacy写真がある。

## 9. Tests / Checks

- `node --experimental-strip-types --test tests/*.test.mjs`: 757 passed, 0 failed
- Focused `tests/album-draft.test.mjs`: 26 passed
- Focused `tests/album-persistence.test.mjs`: 19 passed
- Focused `tests/page-editor.test.mjs`: 28 passed
- `npx tsc --noEmit`: passed
- `npm run build`: passed in isolated source copy (Next.js 16.3.5 / webpack)
- Changed-scope ESLint: passed
- `git diff --check`: passed

## 10. Remaining Issues

- Real score order was unit-tested, but not shown in Browser because the only editable saved Draft predates `layoutRankings`; no new AI generation was run by design.
- No editable saved examples for 2/3/4-photo spreads; the available two-photo Draft is locked.
- Real photo review for 3-photo whitespace and final print/PDF comparison remains incomplete.
- PDF storage upload failed; the unattached verification snapshot was cleaned up, and no PDF object was created.
- Timeline and 5-photo Editor still fallback to original for legacy photos without thumbnail/preview. Network timing bytes were unavailable.
- Task053.2 elements/background preservation succeeded through Editor layout changes and reload; its PDF generation leg remains blocked by the PDF upload failure above.
- Known 18-photo→17-photo multi-pet issue was not reproduced or changed.

## 11. Git

Existing uncommitted changes were retained. No commit, push, or DB migration was made. Browser test additions were cleaned from the active Draft after verification.