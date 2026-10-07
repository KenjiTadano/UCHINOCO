# Task053 — Album Decoration Editor

## Task053.1 Final Verification

担当: GitHub Copilot。commit / pushは未実施。

## 1. Task概要

Task052のDigital spread/editorを拡張し、既存AI slot polishと分離したuser canvas element/backgroundを追加した。既存draft persistence、shared page Undo/Redo、caption suggestion、Print snapshotを再利用している。

## 2. 既存Editor調査

- 既存Text/DecorationはTask062のlayout固定slot・一slot一rowで、x/y/width/height/rotation/z-orderを持たない。
- Task058 generation JSONBはAI初期snapshot専用。user editは専用table/RPCで保存される。
- 既存page historyはText/Decoration/Cropを含むsession stackで、今回も同じstackを拡張。
- Print snapshotはDraft readerから作成され、paid orderは注文時snapshotを別経路で使用する。

## 3. Editable Element Model

`lib/album-elements/model.ts`にText/Stamp/Decorationのunion、14 stamps、5 decorations、4 font families、7 colors、6 backgrounds、座標/rotation/zIndex clampとJSON row mapperを追加した。Stamp/Decorationのaspect比は保持し、page中心snapは閾値内でのみ行う。各要素は`print`または`digital-only`。

## 4. Text

任意Text追加、120文字制限、日本語入力、4 font、10–48px、Bold、color、left/center/right、direct move/resize/rotate、duplicate/deleteを追加。配置は現在layoutで使えるsafe catalog slotから選び、AI写真・Text/Decoration・既存user elementとの重なりを避ける。

## 5. Stamp

14種のlucide-based stamp picker、選択、移動、aspect-locked resize、15度snap rotation、色変更、前後移動、複製、Undo可能な削除を追加。

## 6. Decoration

line/tape/corner/bubble/ribbonの5種pickerと、Stamp同等の直接操作を追加。既存slot decorationは別データ・別UIとして保持。

## 7. Background

左右ページ別のpalette（white/warm/gray/sage/sky/rose）。既存page geometryを維持し、unsetと明示whiteを区別。変更はUndo/Redo対象。

## 8. Drag / Resize / Rotate

pointer captureでtouch/desktop対応。page座標でmove、text幅resize、Stamp/Decorationはaspect lock、rotationは15度snap。負サイズ/NaN/過度なsize/rotationはdomain normalizerでclamp/reject。page center±1.2%のsnap guideをdrag中だけ表示。

## 9. Layer Order

前面/背面へを追加。zIndexは-100〜100に制限し、sorted renderingとhistoryを共有。

## 10. Duplicate / Delete

Duplicateは近接配置でpage内clamp、DeleteはDB rowをsoft-deleteしてUndo可能にした。

## 11. Undo / Redo

既存`useEditorHistory("page")`の同一stackに`element`/`background` fieldを追加。drag/resize/rotate/sliderはgesture coalesceし、undo/redoも通常の保存RPCを経由。

## 12. Persistence

既存AI slot tableへ混在させず、以下のmigrationをリンク済みUCHINOCO DBへ適用した。

- `20261001120000_album_draft_page_elements.sql`
- `20261001130000_album_draft_multiline_text.sql`（Task053.1の改行対応）

1つ目の適用はPL/pgSQL条件式の構文エラーで停止し、migration履歴に部分登録されなかった。CASE式を括弧で囲む最小修正後に適用成功。2つ目は適用済み関数を書き換えず、`CREATE OR REPLACE`で改行だけを許可する追加migrationとして適用した。

Migration内容:

- `album_draft_page_elements`: UUID、spread FK（`ON DELETE CASCADE`）、type、JSONB data、soft-delete、revision/client sequence、timestamps。
- `album_draft_spread_backgrounds`: UUID、spread FK（`ON DELETE CASCADE`）、left/right、background id、revision/client sequence、timestamps。spread/side unique。
- indexes: 未削除elementのspread/updated_at partial index、background spread index。
- RLS: 両tableで有効。SELECT policyはalbum ownerに限定。
- direct grants: authenticatedはSELECTのみ。INSERT/UPDATEは不可。owner/status guard付きSECURITY DEFINER RPCだけにEXECUTEを許可。
- destructive operation/backfill: DROP/TRUNCATE/既存行backfillなし。新規tableなので既存albumとの互換性を維持。

RLS検証はtransaction内で実施してrollbackした。ownerのSELECTとelement/background RPC INSERT/UPDATEは成功、他subjectのSELECTは0行、他subjectのwrite RPCは拒否された。確認用の実データは残していない。

## 13. Print Compatibility

Print snapshot schemaをv2へ更新し、background、print-target elements、revision/fingerprintへ反映。`digital-only`はPDFから除外。PDF rendererはbackground、Japanese Text、font/color/align/bold/rotation、Stamp/Decoration rotationを描画。Print Previewも保存済みuser elements/backgroundsをDigital page surfaceに表示。paid order snapshot pipelineは変更していない。

## 14. Browser Verification

ログイン済みの`AI Draft Lab 2026-04`（editing、4spread）で確認。写真構成は1/1/1/5枚で、2枚および3–4枚spreadの実例はこのDraftにない。

- Text: 日本語複数行入力・保存、Handwritten、22px、Bold、left align、Terracotta、rotation、drag、resize、layer、duplicate/deleteを確認。
- Stamp: Paw追加、drag、aspect-locked resize、rotation 30°、layer、duplicate/deleteを確認。
- Decoration: Ribbon追加、drag、aspect-locked resize、rotation 15°、layer、duplicate/deleteを確認。
- Background: 左をSageにして右がWhiteのままであることを確認。右をRoseに変更後も左Sageが維持され、左右別保存を確認。
- 4spread移動、編集保存、browser reloadを実施。複数行TextとCrop値はreload後に復元された。
- 一時的に加えたText/Paw、背景、Cropは検証後にactive stateから削除・unsetへ復元。既存Star/Autumn Stampは保持。

未解決の表示不一致: spread 3–4の検証Text rowはowner RLSで可視、`printTarget=print`かつmodel mapperの必須値も有効だが、production Editor viewと生成Print snapshotには現れなかった。同じDraftの別spread Text/StampはEditorとsnapshotへ表示された。該当検証Textはsoft-deleteし、他のuser elementへ影響させていない。原因は未特定。

## 15. Human Review

判定: NEEDS_TUNING。

4spreadを開き、1枚spreadと5枚spread、Text/Stamp/Decorationの追加・操作パネルを確認した。見開き単位の操作と選択中ツールは把握しやすく、Canva相当の複雑さはない。一方、3spreadが各1枚構成で印刷プレビューにも白紙ページの注意が出るため、通常アルバムの完成体験を代表しない。またspread 3–4のText表示/Print snapshot不一致が残り、写真crop込みの最終見た目についてAccept判定はできない。2枚/3–4枚spreadと修正後のText経路で再レビューが必要。

## 16. Regression

Task052 photo crop、spread navigation、existing AI Text/Decoration、Smart Layout、5-photo layout、Multi-pet、draft persistence、Print snapshot/paid order isolationの既存テストを維持。Generation pipelineは変更していない。

## 17. Tests

`node --experimental-strip-types --test tests/*.test.mjs` — 742 passed, 0 failed。

Task053範囲の`album-elements`、`page-editor`、`album-print` tests — 45 passed, 0 failed。改行Textのmodel受入とPDF生成経路を追加検証。

## 18. TypeScript

`npx tsc --noEmit` — 成功。

## 19. Build

`npm run build` — 成功。稼働中のユーザーdev serverに干渉しないよう、`/tmp`の隔離rootから実行した。

## 20. Lint

Task053.1変更範囲に対する`npx eslint` — 成功、warningなし。

## 21. git diff --check

成功。新しいmultiline migrationの末尾空白も個別検査済み。

## 22. git status

開始時点の既存modified/untracked差分を保持。Task053.1のmigration、実装/test、報告書は未commit差分。既存の`docs/print-064-book.pdf`は開発出力で上書きせず、production経路でPDFを生成した。commit/push未実施。

## 23. Known Issues

- Multi-pet albumで生成直後18枚から保存後DB上17枚となった既知事象。原因未特定、Task053では未修正。
- spread 3–4のactive Text rowがproduction EditorとPrint snapshotに表示されない不一致。RLS可視、row mapper単体は有効。原因未特定。
- 実Draftは1枚spread×3と5枚spread×1。2枚/3–4枚spreadの操作・reviewは未実施。
- PDF snapshotは`print-render-v2`、Storage objectは`application/pdf`、36,201,543 bytes。Text+Stamp入りspread 7–8がsnapshotに含まれ、写真Crop scale 1.10も保持された。別spreadの検証Text欠落があるためPrint全spreadのHuman Reviewは未完了。
- Print Previewには1枚spread/白紙ページの既存warningあり。Multi-pet 18→17件は再現していない。

## 24. commit / push状態

commit / push未実施。Task053 migration 2件は依頼に基づきリンク済みDBへ適用済み。

## Task053.2 — Missing User Element Fix

### 1. Reproduction

コード変更前の現行実装で、先頭・中間・末尾の3見開きにそれぞれText / Stamp / Decorationと左右背景を持つ保存済み相当のDraft Viewを組み立てた。`applyPreviewUrls`（画像のsigned URL再発行後に呼ばれる）を実行すると、3見開きすべてで`elements`が空配列、左右背景が既定の`null`へ変わることを再現した。

再現前:

- position 0: `element-0`, left background `sage`
- position 1: `element-1`, left background `sage`
- position 2: `element-2`, left background `sage`

再現後:

- position 0〜2: elements `[]`, left background `null`

同じ欠落は`applySpreadLayout`、`applyFrameCrop`、`applyFramePhoto`でも発生するコード経路だった。

### 2. Data Flow Trace

- A/B DB row・owner RLS: `album_draft_page_elements`はowner SELECT、`is_deleted=false`で読まれる。RLSやmigrationは変更していない。
- C/D draft reader・response: `readDraft`はactive versionの全spread IDを取得し、page elementを一括SELECTする。
- E/F raw array・mapper: `mapPageElementRow`はJSONB type、geometry、style、revision、client sequenceを検証し、有効rowを`PageElement`へ変換する。
- G/H normalized model・spread grouping: `draft_spread_id`をkeyに`elementsBySpread`へ格納し、`assembleEditorSpread`へ渡す。ここまでは正しい。
- I page grouping: elementは見開き正規化座標を保持し、x座標により左右ページ上へ配置される。falsyなspread/page index判定はなかった。
- J〜L Editor loader / renderer: 初回loadでは`PersistedSpreadView.elements`がそのままrendererへ渡る。
- 欠落点: Editorの派生状態更新関数が`assembleEditorSpread`を再呼出しする際、`texts`と`decorations`だけを渡し、`elements`と`backgrounds`を省略していた。省略時の既定値`[]`と空backgroundが保存済み状態を上書きした。
- M〜O Print snapshot / JSON / PDF: snapshot builderは入力された`spread.elements`から`printTarget=print`だけを取り込み、PDF rendererまで渡す。この経路自体のfilterは正しい。したがって欠落したnormalized viewを入力するとsnapshotも欠落し、保持されたviewまたはserverから再読込したviewなら含まれる。

### 3. Working vs Failing Comparison

失敗条件はspread UUID、0/1-based index、偶奇、写真枚数、左右side、layout IDではなく、「そのviewが写真URL更新・Layout変更・Crop変更・写真差替えによる再構築を通ったか」だった。

初回reader直後のspreadは正常。特定の中間・後半spreadで画像読込エラーが起きると`refreshUrls()`が呼ばれ、全spreadを再構築するため、その時点で全User Element / Backgroundがメモリ上から消える。別spreadが正常に見えたという観測は、再構築前後または別load時点の差で説明できる。

比較対象のframe count、element side、geometry、printTarget、revision/client sequenceは原因ではなかった。soft-deleted rowは引き続きreaderで除外される。

### 4. Root Cause

根本原因は`lib/album-persistence/editor.ts`の派生spread再構築4箇所で、`assembleEditorSpread`の第6・第7引数（`elements` / `backgrounds`）を渡していなかったこと。

`assembleEditorSpread`がTask053以前から使われており、Task053追加引数に安全な既定値が設定されたためTypeScript errorにならず、既存テストfixtureもUser Elementを持たない状態でLayout/Crop/Photo操作だけを検証していた。このためunit testで見逃された。

Task053.1で確認した実DB rowは最終的にsoft-delete済みであるため、その同一element IDを使った過去snapshot欠落の再追跡はできない。ただし、現行コードの欠落地点は変更前の独立再現で確定した。

### 5. Fix

`reassemblePersistedSpread`を追加し、再構築時に以下を必ず引き継ぐよう統一した。

- `texts`
- `decorations`
- `elements`
- `backgrounds`
- frames / source / preview URL

適用箇所:

- Layout変更
- Crop変更
- 写真差替え
- signed URL更新

DB、RLS、RPC、schema、migrationは変更していない。要素を無条件mergeせず、対象spreadが既に保持する正規化済み状態のみを引き継ぐ。

### 6. Regression Tests

追加・拡張した検証:

- first / middle / last spreadの要素保持
- left / right座標のText
- 1-photo / 2-photo spread
- Text / Stamp / Decoration
- 同一spreadの複数element
- 複数spreadのelement
- Layout / Crop / Photo / signed URL再構築後も保持
- assembleによるreload相当でも保持 -左右background保持
- `printTarget=print`はsnapshotへ含む
- `digital-only`はsnapshotから除外
- 3 spread / 7 page PDF生成
- 既存soft-delete reader filterとRLS/RPC構造を維持
- Undo / Redo、Task053 element model、Task054 Smart Layout等の全回帰

### 7. Browser Verification

ローカル`/dev/album-persistence`へ直接アクセスしたが、認証ガードにより`/login`へ遷移した。検証用ログイン情報を使用していないため、実ブラウザでspread 1 / middle / lastへ要素を追加する操作は未実施。

その代替として、production Editorと同じ`PersistedDraftView` / `assembleEditorSpread` / 派生更新関数を使った再現・修正後テストを実施した。実ブラウザE2Eは認証済みセッションで追加確認が必要。

### 8. Print Snapshot / PDF Verification

first / middle / last spreadへText / Stamp / Decorationを配置した3見開きfixtureをsnapshotへ変換し、element IDがそれぞれ同じspreadに保持されることを確認した。`digital-only`は除外され、左右backgroundも正しいspreadへ入った。

同snapshotからPDFを生成し、7ページ、`%PDF` header、render完了を確認した。元のTask053.1 element IDはsoft-delete済みのため同一IDによる実DB→PDF追跡は未実施。

### 9. Final Human Review

判定: ACCEPTABLE（自動render経路） / NEEDS_TUNING（実ブラウザ目視）。

- 1-photo spread: Textの保持とPDF反映を確認。
- 2-photo spread: Text / Stamp / Decoration / Backgroundが再構築後も維持されることを確認。
- 5-photo spread: 既存Task053/054の全回帰テストでrenderer・Editorを維持。
- 実ブラウザでの保存→spread移動→reload→Print Preview目視は認証セッション不足により未完了。

### 10. Remaining Issues

- 認証済み実ブラウザで、同一element IDのDB / Editor / snapshot / PDF追跡を行う必要がある。
- Task053.1でsoft-delete済みの過去検証rowは、その時点のactive draftとの所属関係を再確認できない。
- 今回の原因はUser Element / Backgroundの派生view欠落。DB reader・RLS・snapshot filterに別の欠落原因は確認されなかった。

### 11. commit / push

commit / pushは実施していない。
