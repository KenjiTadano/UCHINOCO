# Task057.1 Album GET Hang Fix + Real Benchmark Review

実施日: 2026-10-02  
状態: GET経路の修正・自動検証完了 / 認証済みBrowser E2Eと実物ベンチマークは入力不足により未完了

## 結論

通常GETが長時間 loading のまま残り得る主要因は、表示写真ごとに `Storage.info()` を無制限並列で呼び出すN+1経路と、Album listで最大300枚を取得して署名対象へ含める処理だった。さらにViewer / Page Editor / Print Previewでは、同一GET内で認証・album確認・draft取得をServer Action経由で重複していた。

以下の最小修正を行った。

- 通常GETでは未確認previewに対する写真単位の `Storage.info()` を実行しない。
- 通常GETはDBに保存済みのthumbnailを優先し、なければoriginalへ安全にフォールバックする。
- 明示的なrefreshだけがpreview objectの存在・MIME・サイズを検査する。
- Album listの年内最大300枚取得を廃止し、棚に必要な8か月について各月1枚だけ取得する。
- Viewer / Page Editor / Print Previewは、既に認証・所有権確認に使ったrequest-scoped Supabase clientで `readDraft()` を呼ぶ。
- token、signed URL、画像データを含まないstage timingを追加した。

timeout、loading UIの隠蔽、fake data、RLS回避は使用していない。

## 安全な計測ステージ

サーバーログへ次の名前、成否、所要msだけを出力する。

- `list.initial-queries`
- `list.shelf-months`
- `list.image-urls`
- `detail.list-image-urls`
- `draft.version`
- `draft.spreads`
- `draft.elements`
- `draft.preview-urls`

秘密情報、Cookie、token、signed URL、Storage path、画像内容は出力しない。

## GET経路の変更

### Album list

変更前は当年写真を最大300枚取得し、月棚の8枚を選ぶために全行を走査し、画像URL生成にも渡していた。変更後は1月から8月までを月範囲で問い合わせ、各queryを `limit(1)` にした。棚用の最大取得件数は8枚で固定される。

### Viewer / Complete

所有権を確認済みの同じSupabase clientを使い、active draftを直接読む。再認証・再album取得を伴うServer Action呼び出しを外した。

### Page Editor

active draftは同じrequest-scoped clientで取得する。候補写真は既存上限80枚を維持するが、通常GETで最大80回のStorage metadata probeは発生しない。

### Print Preview

active draftは同じrequest-scoped clientで取得する。Print用original取得・PrintSpecは変更していない。

## 自動テスト

追加・更新した確認:

- 通常GETでStorage `info()` が0回で解決する。
- 明示refreshではpreviewを検査して利用できる。
- thumbnailがないlegacy写真もoriginalへフォールバックして解決する。
- Album detail / Page Editor / Print Previewがrequest-scoped clientでdraftを読む。
- Album listに `.limit(300)` がなく、月別 `.limit(1)` を使う。
- draftの各主要段階に安全な計測がある。
- 既存layout / crop / elements / reload復元テストを維持する。

結果: 786 tests passed / 0 failed。

## Browser E2E

今回利用可能なIn-app Browserには開いているタブも認証済みセッションもなかった。このため、次の実アカウント操作は未実施。

1. Home
2. Album list
3. AI Draft complete
4. Viewer
5. 「このままでOK」
6. Edit
7. Back
8. Reload
9. Print Preview

コード上のGET解決・reload復元はテストとproduction buildで確認したが、上記を実ブラウザ完走したとは判定しない。

## しまうまプリント実物 Minimum Benchmark

Task057.1の添付ディレクトリには指示テキスト1件だけがあり、比較対象の実物写真ファイルは存在しなかった。現在の会話コンテキストからも画像本体を参照できないため、実物とのHuman Reviewを推測で採点していない。

したがって次の項目はすべて **NOT REVIEWED** であり、`BENCHMARK PASSED` とは判定しない。

- Hero clarity
- Crop quality
- Layout variety
- Whitespace
- Page rhythm
- Story coherence
- Print readability
- Photo prominence
- Event/text page quality
- Emotional quality

1 / 3 / 4 / 5 photoのブラウザ実写真比較、face / ear / body crop、title-only page、写真＋大余白＋日付、154 × 216 mm（Trim 148 × 210 mm、Bleed 3 mm）の実PDF比較も未確認。ベンチマーク画像が再添付され、認証済みブラウザが利用できる時点で再評価が必要。

## 検証結果

- `node --experimental-strip-types --test tests/*.test.mjs`: PASS（786 / 786）
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS（Next.js 16.3.5 / webpack）
- 変更範囲ESLint: PASS（既存の`<img>`警告2件のみ）
- `git diff --check`: PASS
- 全体 `npm run lint`: FAIL（今回の変更外に既存lint error。Smart Crop、Cover editor、Page polish、Album generating、`supabase/.temp`生成物など）

Build時にはApple Silicon上のRosetta 2警告が出たが、コンパイル・型検査・ページ生成は成功した。

## 変更しなかったもの

- DB / migration
- RLS / Storage policy
- Album生成ロジック
- layout / crop / elementsの保存仕様
- PrintSpec
- provider注文・課金

commit / pushは実施していない。
