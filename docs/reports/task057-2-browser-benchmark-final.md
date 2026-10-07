# Task057.2 Browser Final E2E + Benchmark Review

実施日: 2026-10-02
判定: **未完了 / BENCHMARK PASSEDではない**

## 結果

Task057.1の回帰テストは対象42件すべて成功した。一方、認証済みBrowser E2EとTask057.1の指定GET stage計測は、利用可能なブラウザセッションが未認証だったため実行できていない。ユーザー提供のしまうまプリント実物写真もワークスペース内で確認できず、Minimum Benchmarkとの比較は成立していない。

DB migration、アプリコード変更、commit、pushは行っていない。

## Browser E2E

- `http://localhost:3000/` は `/login` へ307 redirect、ログイン画面は200で表示された。
- ページ再読込後も `/login` のまま。認証済みsessionは確認できなかった。
- Home → Album list → AI Draft complete → Viewer → 「このままでOK」 → Edit → Back → Reload → Print Preview は未実施。
- `/` と `/login` の観測範囲では404や画面上のruntime/hydration/signed URL errorは確認されなかった。ただし、対象Album routeを開けていないため、各routeのエラーなしを保証しない。
- 開発サーバーログ: `/` 307 in 501ms、`/login` 200 in 130msおよび93ms。いずれもAlbum GET stageの時間ではない。

## GET Timing

指定された次のstageは、認証済みリクエストがなく**すべて未計測**。異常に長くないとは判定できない。

- `list.initial-queries`: 未計測
- `list.shelf-months`: 未計測
- `list.image-urls`: 未計測
- `detail.list-image-urls`: 未計測
- `draft.version`: 未計測
- `draft.spreads`: 未計測
- `draft.elements`: 未計測
- `draft.preview-urls`: 未計測

## Album List Network

コード確認では、月棚は8か月×`limit(1)`で最大8枚。通常月写真は`limit(3)`、最近写真は`limit(8)`、お気に入りは`limit(1)`、アルバムは`limit(40)`。`.limit(300)`はなく、通常GETのpreview存在確認は`refresh=false`のためStorage `info()`を呼ばない。thumbnailのsigned URLを先に使い、不足時はpreview/thumbnail/originalへfallbackする。signed URL生成はpath重複排除・cache付きで、アルバム表紙を含む対象もコード上は有界。

ただし、`album_photos`は最大40 albumsに対する取得に`.limit()`がなく、選択写真行数の上限は確認できない。実データ件数と実Networkは未観測のため、ここは未解決リスクとして残す。Storage.info floodなし・大量signed URLなしのruntime確認は未完了。

## Viewer / Editor / Print Preview

認証済みrouteのdraft、crop、elements、background、layout、reload復元はブラウザで確認していない。既存の自動回帰テストではdraft保存/復元、layout/crop override、elements、print snapshotの確認が通過したが、実ユーザーsessionでの表示結果とは区別する。

既存 `docs/print-064-book.pdf` は9ページ。pdf-libで測った各ページは436.535 × 612.283 ptで、154 × 216 mmに一致する。Trim 148 × 210 mm、Bleed 3 mmは`ALBUM_PRINT_SPEC`と一致する。これは既存PDFの寸法確認であり、今回のPrint PreviewからPDFを出力した確認ではない。

## Minimum Benchmark / Human Review

しまうまプリント実物写真は確認できなかった。`docs/file.jpe`は506×282のTask050.5 five-photo visual review画面であり、実物写真ではない。よって品質・構造・リズムを実物基準で比較したとは判定しない。

以下は利用可能な既存アーティファクトだけから行った限定的なHuman Reviewで、実物Benchmarkの承認ではない。

| 評価項目                   | 判定         | 観察                                                                                                        |
| -------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| A. Hero clarity            | NEEDS_TUNING | 既存PDFの表紙はタイトルと写真を識別できるが、実物との写真面積比較は未実施。                                 |
| B. Crop quality            | NEEDS_TUNING | 5-photo/layout lab画像にFALLBACK候補が残る。実写真の顔・耳・体のcrop safetyは未確認。                       |
| C. Layout variety          | NEEDS_TUNING | 既存labにHero + 2、3 Equal等の候補がある一方、既存PDFではsingle-photo spreadが続く箇所を確認。              |
| D. Whitespace              | NEEDS_TUNING | 大きな余白と片面写真ページは確認できるが、実物との量・配置比較は未実施。                                    |
| E. Page rhythm             | NEEDS_TUNING | 既存PDFにsingle-photo構成の連続があり、title/event pageを含む通しのリズムは未確認。                         |
| F. Story coherence         | NEEDS_TUNING | 認証済みdraftの全ページを通した順序確認が未実施。                                                           |
| G. Print readability       | FAIL         | 既存Print Preview画像に写真/文字または装飾の重なり警告があり、ページ画像でもcaptionと写真枠の干渉が見える。 |
| H. Photo prominence        | NEEDS_TUNING | Heroとsupportの階層はlayout labで見えるが、1/3/4/5枚の最終印刷面積を現行draftで比較していない。             |
| I. Event/text page quality | FAIL         | 既存Print Previewに文字/装飾の重なり警告があり、日付・captionの印刷可読性に懸念。                           |
| J. Emotional quality       | NEEDS_TUNING | 実物基準および完成draftの通読がないため評価保留。                                                           |

GとIにFAILがあるため、**BENCHMARK PASSEDではない**。

## 1 / 3 / 4 / 5 Photo Review

- 1 photo: 既存Print PDFの表紙/ページ画像で単写真＋余白を目視。現行sessionでは未確認。
- 3 photo: 既存Smart Layout LabのHero + 2および3 Equal候補を目視。現行Viewer/Print出力では未確認。
- 4 photo: 現行の4-photoページを確認できる資料なし。未確認。
- 5 photo: `docs/file.jpe`の5-photo visual review画面を目視。印刷出力としては未確認で、FALLBACK候補あり。

写真枚数別の確認を完了したとは扱わない。

## Next Quality Gaps

- 認証済みブラウザsessionで要求されたAlbum導線を通し、全routeのreloadとエラーを確認する。
- 全8 GET stageの実測値を取得し、遅いstageを切り分ける。
- `album_photos`の件数/取得時間を実データで確認し、必要なら最小の取得上限またはquery変更を検討する。
- しまうまプリント実物写真を入手し、実写真で1/3/4/5枚の構成を比較する。
- FALLBACK crop、連続Hero/単写真、quiet/title/event/date pageの不足、写真サイズ、余白、caption重なりを再確認する。
- 認証済みPrint PreviewからPDFを書き出し、154 × 216 mm、Trim 148 × 210 mm、Bleed 3 mmおよび文字可読性を確認する。

## Verification

- `node --experimental-strip-types --test tests/album-get.test.mjs tests/album-persistence.test.mjs tests/album-print.test.mjs`: PASS（42 / 42）
- 認証済みBrowser E2E: NOT RUN（session未認証）
- 指定GET timing: NOT MEASURED
- 実物Minimum Benchmark: NOT AVAILABLE
- commit / push: 未実施
