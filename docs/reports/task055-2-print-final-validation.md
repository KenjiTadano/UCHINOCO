# Task055.2 — Print Pipeline Recovery & Final Album Validation

## 1. PDF Failure Reproduction

Task055.1と同じ未注文アルバム `AI Draft Lab 2026-04`（4見開き、8写真）を追跡した。修正前rendererで同一snapshotを再生成するとPDFは79,590,518 bytes（約75.9 MiB）となり、`print-files` bucketの50 MiB上限を超えた。Task055.1時点の画面エラー「PDFを保存できません」、`pdf_path = null`、`content_hash = null`、Storage objectなしと整合する。

source originalsの合計は24,589,536 bytes（約24.6 MB）であり、入力画像合計だけでは50 MiB超過を説明できなかった。

## 2. Root Cause

旧rendererは見開き全体を一旦別PDFとして描画し、左右ページへ分割する際に`embedPage`していた。左右それぞれへ同じ見開きpageを埋め込むため、その見開きで使う高解像度画像resourceが左右ページへ重複して入り、8枚の原画像から約75.9 MiBまで増大していた。

失敗地点はPDF renderer後、Storage upload前後のsize境界である。source originals、font、stamp/decoration単体が主因ではない。

## 3. PDF Generation

`lib/album-print/render-pdf.ts`を、見開き中間PDFを作らずA5 bleed pageへ直接描画する方式へ変更した。

- 各写真は1 PDF内で1回だけembedして再利用する。
- 見開き座標を左右page座標へ写像し、page境界でclipする。
- Cover、Photo crop、Text、Stamp、Decoration、Background、print-target判定、日本語複数行を維持する。
- schemaを`print-render-v3`、renderer revisionを`6`へ更新し、旧rendererのcached fingerprintを再利用しない。

同一実データの修正後ローカル再生成は32,838,748 bytes（約31.3 MiB）。最終ブラウザE2Eの保存PDFも32,838,248 bytes、9 pagesだった。画質低下や原画像の強制downsampleによる回避は行っていない。

## 4. Storage Upload

bucketはprivate `print-files`、file size limitは52,428,800 bytes、許可MIMEは`application/pdf`。object pathは`drafts/{albumId}/{fingerprint}.pdf`、`contentType: application/pdf`、`cacheControl: 3600`、deterministic fingerprint pathに対して`upsert: true`を使用する。

まず修正後PDFを一時verification pathへuploadし、32,838,748 bytes / `application/pdf`で成功後に即cleanupした。その後、認証済みブラウザから正式な「PDFを作成」を実行し、32,838,248 bytesのobjectを保存できた。

画像/PDFバイナリをServer Action request bodyとして受け取る構成ではない。Storage操作はowner確認後のserver-only admin client経由で、秘密情報はClientへ渡していない。

## 5. Snapshot Finalization

永続化順序を次のように固定した。

1. PDF size check
2. Storage upload
3. snapshot row save
4. `pdf_path` / `content_hash` attach
5. cacheへ保持

upload失敗時はsnapshot rowを作らない。snapshot save失敗時はupload objectをcleanupする。attach失敗時はobjectと未attach snapshot rowをbest-effort cleanupする。

最終E2E snapshot `59551f2f-a956-4f91-a9b0-5ad260758d72`で`pdf_path`と`content_hash`の両方、Storage download成功、MIME、byte sizeを確認した。`finalized_at`はnullのままで、これは注文確定前の正しい状態である。注文確定用RPCは実行せず、provider注文・課金も行っていない。

## 6. Fix

Task055.2で追加・変更した中心ファイルは以下。

- `lib/album-print/persist.ts`: upload/save/attach/compensationを純粋なorchestratorへ分離
- `lib/album-print/render-pdf.ts`: direct per-page renderingとimage embed cache
- `lib/album-print/config.ts`: `print-render-v3`
- `lib/album-print/snapshot.ts`: renderer revision `6`
- `app/(app)/pets/[petId]/album/[albumId]/print/actions.ts`: 安全なstage log、既存object再利用、永続化順序、cleanup
- `tests/album-print.test.mjs`: persistence成功/失敗/cleanup/size上限のテスト

開発環境の失敗logは`stage`、`code`、`storageStatus`、`generatedPdfByteSize`、`uploadTargetPath`を出す。API key、token、Cookie、signed URL、画像データは出さない。UIの一般向けエラー文は詳細を露出しない。

## 7. Fresh Ranked Draft

remoteのactive draft 2件を確認したが、いずれもTask055以前のlegacy draftで、`generation_metadata.layoutRankings`は未保存だった。既存ユーザーalbumを不用意に増やさないため、新しい永続Draftは作成していない。

一方、認証済みBrowserのSmart Layout Labで実写真を使った新規解析を実行し、現在のranking engineが実データでTop候補を返すことを確認した。永続Draft metadataとしてのfresh ranking確認だけは未完了。

## 8. Picker Real Score

実写真4枚の解析結果でTop4を確認した。

1. `P4_EDITORIAL` — 69
2. `P4_HERO_TOP` — 68
3. `P4_HERO_LEFT` — 67
4. `P4_HERO_RIGHT` — 67

score、tier（今回の実写真はFALLBACK）、FrameMatch、RoleFit、Balance、Variety、CropQ、reasonが実score順で表示された。2枚・3枚でも実ランキングを確認した。Editor Pickerのsaved `layoutRankings`表示はlegacy draftしかないため、実保存metadataでのTop4表示は未確認。legacy fallbackに虚偽scoreを付けない既存挙動は維持されている。

## 9. 1–5 Photo Browser Review

認証済みBrowserで次を確認した。

- 1 photo: 既存DraftのHero。大きな主写真と十分な白場。
- 2 photos: 実写真解析で`L03 2-Up Horizontal`が首位（68）。Equal pairとして読みやすい。
- 3 photos: 実写真解析で`L04 Hero + 2`が首位（71）。Heroとsupportの階層が明確。
- 4 photos: 実写真解析で`P4_EDITORIAL`が首位（69）。editorial hierarchyは明確だが、2枠がfallback crop判定。
- 5 photos: 既存Draftで5 unique photos / 5 unique frames、L13〜L20候補とHero/Equal系切替をTask055.1から継続確認。

写真枚数・frame integrity・候補差は確認できた。今回選んだ2〜4枚実写真は一部cropがFALLBACKのため、個々の写真組合せには微調整余地がある。

## 10. Task053 Final E2E

同じ認証済みBrowser sessionで、未注文Draftへ以下を実施した。

1. 日本語複数行Text「ずっと、いっしょに。\n大切な思い出」を追加
2. Line Decorationを追加
3. 左pageをWarm、右pageをPale Sage Backgroundへ変更
4. 既存Star / Autumn StampとPhoto cropを維持
5. save完了を確認
6. spread移動
7. reload
8. Text / Decoration / Background / Stamp / Cropの復元を確認
9. Print PreviewでText、Decoration、Stampを確認
10. snapshot生成
11. PDF保存

最終snapshotは4 spreads、8 frames、element types `text / decoration / stamp / stamp`、左右Backgroundを保持した。PDFへの到達とStorage保存まで完走したため、Task053のPDF legは正式完了と判定する。

## 11. PrintSpec Verification

ブラウザE2Eで実際にStorageへ保存されたPDFを再読込し、全9ページで次を確認した。

- Media/page size: 154 × 216 mm
- TrimBox: `[3, 3, 151, 213]` mm = 148 × 210 mm
- BleedBox: `[0, 0, 154, 216]` mm
- Bleed: 各辺3 mm

A5 trim + 3 mm bleedのPrintSpecと一致する。

## 12. Egress Follow-up

最終snapshot対象8枚のうち、thumbnail readyは6枚、legacy thumbnail未生成は2枚だった。

- `2f44d467-e84c-46ed-9775-d795e143631d`
- `72730214-38ed-49cf-8022-fc2da74e6387`

Editor/PDFはoriginalが必要なためTask052.1のoriginal image delivery方針を変更していない。無制限bulk backfillは実行していない。既存の安全なユーザー起動backfill経路を使用する対象として残す。

## 13. Human Review

総合判定: **ACCEPTABLE**。

- 1-photo Hero: OK。主写真が明確。
- 2-photo Equal: ACCEPTABLE。写真サイズと白場のバランスが自然。
- 3-photo Story: ACCEPTABLE。Hero + supportの差が明確。
- 4-photo Grid/Editorial: ACCEPTABLE。ただし選択実写真ではfallback cropが2枠あり、組合せ依存の微調整余地あり。
- 5-photo Hero: ACCEPTABLE。Heroを保ちながら5枚を維持。
- 5-photo Equal: ACCEPTABLE。候補差が視認でき、frame重複なし。

PDF pipelineとPrintSpecはGateを通過した。fresh persisted rankingと一部fallback cropは次の品質改善項目であり、pipelineを阻害しない。

## 14. Regression

- Text: snapshot・reload・Print Preview・PDFまで保持
- Stamp: 既存2件を保持
- Decoration: snapshot・reload・Print Preview・PDFまで保持
- Background: 左右別設定をsnapshot・PDFまで保持
- Photo crop: 既存cropを維持
- digital-only exclusion / print-target inclusion: unit test成功
- multi-spread: 4 spreads / 9 PDF pages
- 5-photo spread: 5 unique photos / frames
- Japanese multiline: unit testと実Browser入力の両方で成功
- provider production order / 課金: 未実行

## 15. Tests

`node --experimental-strip-types --test tests/*.test.mjs`

- 762 passed
- 0 failed
- 0 skipped

追加したpersistence testはupload success、upload failure、failure時no snapshot、save/attach failure cleanup、50 MiB超過のupload前拒否を含む。既存のmulti-spread、user elements、日本語複数行、ranked metadata、legacy fallbackも成功した。

警告はNodeの`MODULE_TYPELESS_PACKAGE_JSON`のみで、test failureではない。

## 16. TypeScript

`npx tsc --noEmit`: 成功。

## 17. Build

`npm run build`: 成功。Next.js 16.3.5 / webpackでcompile、TypeScript、page generation、build traceまで完了した。

既知警告としてApple Silicon Mac上でx86-64 Nodeを使っているためRosetta 2警告が出た。build failureではない。

## 18. Lint

`npm run lint`: 成功。ESLint error / warningなし。

## 19. git diff --check

`git diff --check`: 成功。whitespace errorなし。

## 20. Known Issues

- active saved Draftはlegacyで`generation_metadata.layoutRankings`がない。実写真ranking自体はBrowserで確認したが、fresh persisted DraftのPicker Top4確認は未完了。
- 2〜4枚の検証写真では一部frameがFALLBACK crop。renderer/Storage障害ではないが、写真組合せごとのlayout quality tuning余地がある。
- legacy thumbnail未生成が2枚あり、一覧/previewのegress改善対象として残る。bulk backfillは未実行。
- `finalized_at`は注文確定時のfieldであり、今回の未注文PDFではnull。`pdf_path` / `content_hash` attachとStorage objectは正常。
- Dev logには以前のNext/Image LCP警告とRosetta警告が残るが、今回のPDF failureとは無関係。

## 21. commit / push

既存未commit差分を保持した。Task055.2でもcommit / pushは実行していない。DB migrationは追加していない。provider注文・課金も実行していない。
