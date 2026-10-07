# Task050.5 — Variable Photo Count / 5-photo Layout Support

## 1. Task概要

5-photo spreadが`NO_LAYOUT_FOR_COUNT`で空のDraftになっていた問題に対し、既存layout catalogへ5枚用のStory/ Grid構成を追加した。count判定、frame matching、Hero、Density、Rhythmの既存architectureは維持した。

## 2. 根本原因

- 既存catalogは1〜4枚のみで、5枚layoutは存在しなかった。
- `layoutsForPhotoCount(n)`とAlbum Draft側の`layoutsForSpread()`は`photoCount === n`のexact count検索。
- `buildSpreadDraft()`は候補layoutがなければ`NO_LAYOUT_FOR_COUNT`をwarningとして返し、そのspreadを`unusable`にする。例外はthrowせず、`buildAlbumDraft()`は他spreadを引き続き処理する。
- Album Storyは最大6枚を1 spreadにまとめられる一方、Album Draftに既存の5枚対応layoutや自動spread分割はなかった。

## 3. Existing Layout Catalog

編集前のSmart Layout catalog:

- 1枚: `L01`, `L01b`
- 2枚: `L02`, `L03`, `L10`
- 3枚: `L04`, `L05`, `L08`, `L09`, `L11`
- 4枚: `L06`, `L07`
- 5枚以上: catalog entryなし

Draft専用hierarchy catalogの`L12`/`L12b`は2枚用。count範囲を持つtypeはなく、layoutの`photoCount`はexact count。

## 4. 追加/変更Layout

`lib/smart-layout/layouts.ts`へ2件を追加した。

- `L13` — `Portrait Hero + 4`: 左ページにportrait Hero、右ページに4枚のsquare supportを縦積み。`purpose: story`。
- `L14` — `5 Balanced Grid`: 左ページに2枚のlandscape primary、右ページに3枚のsquare crop primaryを配置。左右のframe面積を既存Album Draftのeven-primary gateに合わせた。`purpose: collage`。

新しいcrop shape、role、layout typeは追加していない。IDは既存連番に続けた。

## 5. Layout Family

- `L13`は既存`layoutFamily()`により`story`。
- `L14`は既存`layoutFamily()`により`grid`。
- 新しい独立familyは追加せず、既存rhythmへ統合。

## 6. Hero / Best Shot対応

- `L13`は既存`hero` slotとしてHero rankingに参加する。
- Hero suitability/confidence、PI、Best Shot primary、strict tier判定はTask050.2の既存計算を再利用。
- 5枚の明確なHero fixtureではBest Shot leaderが`L13` Hero slotへ割り当てられることを確認。
- near-equalおよび弱写真fixtureではbalanced gridが選ばれ、弱写真をHeroへ強制しない。
- 実ブラウザーの5-photo spreadは`heroConfidence = 0.28`であり、Hero型へ寄せず`L14`を選択した。

## 7. Density

Density計算自体は変更していない。既存`densityBonus()`によりdense・4枚以上のcollageは既存bonusを受け、Story型はstoryTypeとHero suitabilityによる既存rankingで競争する。今回の実データGrid spreadは`dense`。

## 8. Frame / Crop Safety

- 全frameは既存`landscape`/`portrait`/`square` crop shapeを利用。
- Photo × Frame assignment、crop quality、orientation affinity、hierarchy fit、face/head/ear safety、`STRICT > FALLBACK > UNUSABLE`は既存処理を維持。
- 5枚Balanced GridはAlbum Draftの`evenPrimaryRatio` gateを満たすframe比率へ調整した。
- print/draft側に1 spread最大4枚の固定制約は見つからなかった。`placeFrames()`とPreview/Print snapshotはassignment配列を処理する。

## 9. Variable Count方針

- 既存`photoCount` exact count概念を継続利用。`minPhotos`/`maxPhotos`へのtype変更や大規模リファクタはしていない。
- 新しいexact countのlayoutをcatalogに足すだけで既存generic filterへ自動参加する。
- 6枚以上にlayoutはまだない。splitは追加せず、既存`NO_LAYOUT_FOR_COUNT`診断を維持。

## 10. Album Draft Fixture

既存10-spread fixtureへ4件の5-photo spreadを追加し、Hero/Supportとall-primaryの両構成を含めた。

- 5-photo spreadの`NO_LAYOUT_FOR_COUNT`なし。
- 5-photo spreadはすべてusable status。
- `L13`/`L14`、story/grid family、rhythm debugがfixture内に存在。
- 同一inputを2回生成しlayout IDが同一。spread全体でfamily diversityと反復escape条件も確認。

## 11. Browser Verification

- 対象: `/dev/album-draft`、36-photo pet「わか」、2026年4月（10枚）。
- 以前`NO_LAYOUT_FOR_COUNT`だったSpread 4は`L14`で完了。
- Spread 4: 5 photos、4 primary + 1 secondary、`dense`、status `ready`。
- 表示値: Layout `L14`, Family `grid`, Rhythm `+2`, Repeat `0`, Gap `-7`, Hero confidence `0.28`。
- crop quality `55`、hierarchy `78`、balance `68`、story fit `70`。
- 5 frameすべてのimageが読み込み済み。missing/black fallback frameなし。
- Screenshot: [smart-layout-050-5-five-photo-verify.png](../smart-layout-050-5-five-photo-verify.png)

## 12. Human Review

実データspreadと、その5枚のsource imageを使った一時的なbrowser comparisonで確認した。Hero/Grid比較fixtureはレビュー後にDOMから除去し、アプリコードには残していない。

- Hero + 4 support (`L13`): **ACCEPTABLE**。Heroとsupportの役割差は明確。supportは小さめなので強いHero画像がある場合に限る。実DraftではHero confidenceが低く、選択されなかった。
- Balanced Grid (`L14`): **OK**。2 landscape + 3 supportのサイズが揃い、5枚が明瞭。実Draftで選択されたケース。
- Mixed landscape/square (`L14`): **ACCEPTABLE**。異なるsource aspectを既存crop matchingで配置し、frame overflow/black fallbackなし。portrait・landscape・squareのfixtureはautomated testで検証。

## 13. Regression

- 1〜4枚のexisting layoutsは変更していない。
- `LL → L03`, `PP → L02`, quality gap `→ L04`, equal faces `→ L05`を含む既存assertionsを維持。
- Task050.1 Orientation Affinity、Hierarchy Fit、Weak Photo handling。
- Task050.2 PI/Best Shot、Hero Suitability、Hero Confidence。
- Task050.3/050.3.1 Rhythm、Repetition Escape、determinism、contextなしfallback。
- Task050.4 Large Image Degradeは変更していない。
- Unsupported 6-photo spreadもthrowせず、`NO_LAYOUT_FOR_COUNT`を返してDraft処理を継続する。

## 14. Tests

関連tests: **107/107 pass**。

対象: `tests/smart-layout.test.mjs`, `tests/album-draft.test.mjs`, `tests/best-shot.test.mjs`, `tests/album-generation.test.mjs`, `tests/album-story.test.mjs`, `tests/album-print.test.mjs`。

5 landscape、5 portrait、mixed orientation、Hero leader、near-equal grid、weak-photo Hero回避、strict/fallback、contextなし、family/rhythm、unsupported 6枚、10-spread fixtureを含む。

## 15. TypeScript

`npx tsc --noEmit`: **success**。

## 16. Build

`npm run build`: **success**。

## 17. Lint

- 変更範囲Lint (`lib/smart-layout/layouts.ts`, `tests/smart-layout.test.mjs`, `tests/album-draft.test.mjs`): **success**。
- `npm run lint`全体: **failed**, 194 errors / 39 warnings。エラーは今回変更していない既存ファイル/生成scriptを含む。Task050.5対象3ファイルのerrorではない。

## 18. git diff --check

**success**。

## 19. git status

- Modified by this task: `lib/smart-layout/layouts.ts`, `tests/smart-layout.test.mjs`, `tests/album-draft.test.mjs`。
- Added by this task: `docs/smart-layout-050-5-five-photo-verify.png`, this report.
- Task開始前から存在する他の未commit差分と未追跡assetは保持。今回の作業ではrevertしていない。
- DB migrationなし。

## 20. 残課題

- 6枚以上のspread分割は未実装。今後はStory側のphoto budgetとDraft layout capacityを合わせた分割方針が必要。
- 実ブラウザーでは5-photo spread 1件を検証。Hero型L13は強いHeroのsynthetic fixtureでcandidate/assignmentを検証し、同source imageの一時previewで構成レビューしたが、実ユーザーの高confidence 5-photo spreadを本番pipelineから取得した検証ではない。
- Browserで確認したGrid spreadのcrop qualityは55。画像は表示され、statusはreadyだが、Album Accept Rateを測る複数ユーザー/期間の評価は今後必要。
- 全体Lintは既存の未変更ファイル/生成scriptにより失敗中。

## 21. commit / push状態

- commit: **未実施**
- push: **未実施**
