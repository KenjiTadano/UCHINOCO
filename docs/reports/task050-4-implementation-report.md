# Task050.4 — Album Draft Large Image Verification Fix

## 1. Task概要

/dev/album-draftで5MB超のoriginal画像が1枚でもあるとAlbum Draft全体が停止し、Task050.3/050.3.1のRhythm Debugを確認できなかった問題を修正した。

目的は大容量画像を無理にAIへ送ることではなく、dev verificationだけ安全にdegradeしてAlbum Draftを最後まで描画すること。

## 2. 根本原因

- 5MB判定は`app/(app)/dev/smart-crop/actions.ts`のoriginal storage blobに対して行われていた
- 判定対象はdownload後の`blob.size`
- 5MB超の場合、Smart Cropが`emptyResult("AI解析できる画像サイズは5MBまでです。")`を返していた
- Album Draftは`Promise.all(photoIds.map(analyzeSmartCropPhoto))`後、1件でも`ok=false`またはanalysisなしなら全体returnしていた
- さらにAlbum Story -> Album Candidates -> Best Shot -> Grouping -> Smart Cropの連鎖で、Draft到達前に失敗していた
- existing thumbnailはpreview用で、AI入力へのresized fallbackとしては使われていなかった

## 3. 変更ファイル

- `app/(app)/dev/smart-crop/actions.ts`
- `app/(app)/dev/photo-intelligence/actions.ts`
- `app/(app)/dev/photo-grouping/actions.ts`
- `app/(app)/dev/best-shot/actions.ts`
- `app/(app)/dev/album-candidates/actions.ts`
- `app/(app)/dev/album-story/actions.ts`
- `app/(app)/dev/album-draft/actions.ts`

## 4. Large Image処理

- `allowLargeImageDegrade`をdev Album Draft呼び出し連鎖だけに追加
- 通常のSmart Crop / Photo Intelligence呼び出しでは従来どおり5MB制限を維持
- dev option時のみ、5MB超画像をOpenAIへ送らず中央基準のfallback geometryを生成
- Smart Cropは`ok=true`のdegraded resultとしてframe matchingまで継続
- Photo IntelligenceはVisionを呼ばず、技術評価とfallback scoreを生成
- Photo Intelligence warningに`LARGE_IMAGE_SKIPPED`を追加
- production UXとAI解析仕様は変更していない

## 5. Stored Analysis優先

Smart Crop / Photo Intelligenceとも、既存memory cacheまたはpersisted analysisを先に利用する既存経路を維持した。

保存済みgeometry / PIがある場合は5MB制限判定より前に再利用され、新しいAI解析は起動しない。

## 6. Graceful Degradation

- 解析不能な画像だけ中央fallback / degraded扱い
- album全体のthrow・全体returnは発生しない
- 既存warningでlarge image skipを識別可能
- Smart Layout / Rhythm coreは変更していない
- DB migrationは追加していない

## 7. Debug UI

実ブラウザで以下の表示を確認した。

- Layout ID
- Layout Family
- Rhythm adjustment
- Recent families
- Repeat
- Gap
- heroConfidence

## 8. Browser Verification

対象: 現在認証ユーザーの36-photo pet、`/dev/album-draft`、2026年4月・10枚。

結果:

- 5MB超画像を含む状態で処理が最後まで完走
- 以前の`AI解析できる画像サイズは5MBまでです。`による全体停止は解消
- Spread 1〜4のAlbum Draft Debug cardを描画
- Spread 1: `L01`, Family `hero`, Rhythm `+0`, Repeat `0`, Gap `N/A`, Hero confidence `0.7`
- Spread 2: `L01`, Family `hero`, Rhythm `-4`, Repeat `1`, Gap `22`, Hero confidence `0.7`
- Spread 3: `L01b`, Family `hero`, Rhythm `-4`, Repeat `0`, Gap `-2`, Hero confidence `0.7`
- Spread 4: `NO_LAYOUT_FOR_COUNT`。既存catalogに5-photo layoutがないための別問題で、large image errorではない

スクリーンショットはブラウザ一時artifactとして取得した。ブラウザツールからworkspace内の`docs/smart-layout-050-4-album-draft-verify.png`へ直接保存する機能はないため、同名ファイルは作成していない。

## 9. Regression

Task050.1 / 050.2 / 050.3 / 050.3.1のSmart Layout、PI、Best Shot、Album Draft、Rhythm挙動を維持した。

`STRICT > FALLBACK > UNUSABLE`、deterministic、contextなしfallbackも維持した。

## 10. Tests

関連テスト: **86/86 pass**

対象:

- `tests/smart-layout.test.mjs`
- `tests/best-shot.test.mjs`
- `tests/album-draft.test.mjs`
- `tests/album-generation.test.mjs`
- `tests/album-story.test.mjs`

## 11. TypeScript

`npx tsc --noEmit`: **success**

## 12. Build

`npm run build`: **success**

## 13. Lint

変更範囲Lint: **success**

## 14. git diff --check

**success**

## 15. git status

既存の未commit差分、Task050.3系差分、生成成果物を保持している。今回の変更も未commit状態。

## 16. 残課題

- 5-photo用layoutが既存catalogにないため、5-photo spreadは`NO_LAYOUT_FOR_COUNT`になる
- スクリーンショットはブラウザ一時artifactであり、workspaceファイルとしては保存していない
- degraded画像の個別statusは既存warning経路で識別している

## 17. commit / push状態

- commit: **未実施**
- push: **未実施**
