# Task078.2 — Album Creation UX & Editorial Layout System v1

- Date: 2026-10-09 (Asia/Tokyo)
- Branch: `feature/task078-2-album-creation-editorial-layout`
- Base: `main` / `origin/main` at `661cd791764f755ddde444a68c163154f164ab50`
- Status: implementation and automated verification complete; authenticated real-photo / visual acceptance remains unverified.
- Task078.2 has **not** been merged to main or deployed.

## 開始前の確認とmain反映

取得した最新 `origin/main` は当初 `b94daa0` で、Task077.2 / Task078はいずれも未反映だった。作業ツリーはcleanだったため、まずこの前提未達を報告し、実装を開始せず確認した。

ユーザーのmerge承認後、Task077.2の `370c1e0` / `0340a4e` とTask078の `2823e0a` / `d03283a` をローカルmainへ反映。993件のテスト、tsc、lint、buildを確認した。その後、GitHub mainへのpushについて別途明示承認を得て `661cd79` をpushした。mainとorigin/mainの一致、cleanな作業ツリーを確認したうえで、本タスク専用ブランチを作成した。

## 実装した作成体験

| 確定要件 | 実装 |
| --- | --- |
| デフォルト全ペット | 所有する登録済みペットすべてを初期選択。ルートのペットだけに限定しない。 |
| 個別・複数選択 | チェックボックスで任意の組み合わせ。サーバーでも所有するID・空選択を検証。 |
| 期間選択 | 最近3か月・半年・1年・すべて・任意期間。任意期間は日本時間の日付境界で検証。 |
| 24 / 48 / 72P | 48Pを初期値・おすすめとして表示。**本文のページ数**と明記し、表紙・裏表紙は別扱い。 |
| ページ数前提の写真選定 | 先に12 / 24 / 36見開きの予算を確保し、Best Shotを横断ランキングして写真を選定。 |
| Preview First | 新規生成後は `?view=preview` へ。既存の完了画面にも「アルバムを見る」を追加。編集は任意の導線。 |
| 表紙・本文・裏表紙の分離 | 保存済みの表紙を単独表示。本文だけを実在する2ページの見開きで表示。新Editorialアルバムは固定ブランドの裏表紙を単独表示。表紙の既存編集画面も単独表示を維持。 |
| 存在しないダミーページ非表示 | 表紙・裏表紙の隣に空のページ領域を作らない。既存アルバムに新仕様の裏表紙を付け足さない。 |
| 意図しない白紙禁止 | すべての見開きに写真を配置。1枚の見開きでは対向ページに実際の日付・既存キャプションを保存。白紙・使用不能・Crop安全性違反は保存前に拒否。 |
| Best Shotを大きく扱う | 見開き内で最高評価の写真をprimaryとし、主写真よりsecondaryが大きくなる候補は既存ゲートで除外。表紙も選定写真内の最高評価を使う。 |
| Layout Template Library | 新規本文34種類＋既存の表紙6種類＝40種類。1〜6枚、Story、Quiet、Closingを含む。 |
| Diversity Engine | 同一ID・similarGroupの連続を避け、使用回数のペナルティを加えて候補を選択。解消不能な同一・類似レイアウトの連続は最終ゲートで拒否。 |
| Whole Album Rhythm Audit | 全見開きのレイアウト・密度・写真枚数・Hero・左右配置の連続、全体の種類数、Crop、白紙、時系列を検査。90点未満なら最大2パスで候補を再選択。 |

このv1は既存解析とルール・スコアリングによるテンプレート選択であり、モデルの再学習は行っていない。表紙6デザインは既存の編集UIで選択可能で、新規生成の表紙は既存のsimpleデザインを初期値として利用する。

## 写真選定と保存

- Best Shotのprimary / secondaryを対象とし、alternate・技術品質の低い写真で水増ししない。同じ写真IDを本文で重複使用しない。
- 品質を優先しつつ、ペット別採用比率に最大12点の補正を加える。均等配分は強制しない。
- 最低必要な異なる選定写真は24Pで12枚、48Pで24枚、72Pで36枚。足りないときは、写真追加・期間変更・ページ数変更を案内し、アルバム行を作成しない。
- 写真が十分ある場合は写真枚数・密度に変化を付ける。最低枚数付近では密度や写真枚数の多様性に限界があり、残る非blockingなRhythm警告はmetadataに記録する。実写真での調整が必要。
- 写真読取は対象ペット・所有者・期間で制限し、200件ずつ最後まで取得する。単一ペットの200件打ち切りを解消し、解析メタデータ読取も200件単位にした。
- Cropの追加解析は4件ずつ処理。既存解析の再利用・フォールバックを維持する。
- 単一・複数ペットとも初稿と表紙を保存する。既存の `album_pets` と保存RPCを利用し、DB migrationは追加していない。
- `requested_body_pages`、対象ペットID、全source写真ID、Editorial version、監査前後の結果と再配置数をgeneration metadataに保存する。
- 写真・本文・キャプション・表紙の通常の保存失敗時は新規アルバムを削除する既存cleanup方式を使用する。保存全体を新しい単一DB transactionへ置き換えてはいない。

## レイアウト、Crop、Viewer、Print

テンプレートは `photoCount`、Hero slot、orientation、density、role、cropSafety、text可否、recommendedSceneTypes、avoidAfter、similarGroupを持つ。本文テンプレートの左右ページ内の座標をそのまま実ページへ写像し、従来の縦積み配置に潰さない。ノドを跨ぐ写真は作らない。

新テンプレートのCrop計算には実際の配置枠の縦横比を使う。生成・保存後のViewer・Editor・PDFで同じ座標とCrop枠を復元し、レイアウトIDだけを交換せず、その候補で検証した写真割当とCropを一緒に再配置する。

1枚見開きのことばは、既存DBのプレーンテキスト・80文字制約に合わせる。絵文字を途中で壊さず、実際の日付と既存キャプションだけを使う。Editorialのことばページだけは複数行に対応し、既存の2行キャプション表示・検査は維持した。

Viewerでは保存済み表紙を読取だけで復元し、差し替えた表紙写真のURLも別途取得する。本文全体にアクセスできるサムネイルと表紙・本文・裏表紙への導線を追加した。Editorでは既存アルバムのレイアウト候補を維持し、新Editorialアルバムは新ライブラリから変更できる。保存済みlayoutRankingsの読取も修正した。

本文の24 / 48 / 72Pにタイトル・イベント用の追加ページを差し込まない。新Editorial PDFでは実在する表紙と裏表紙を各1ページ出力するため、総ページ数は26 / 50 / 74となる。裏表紙はv1では固定のブランドページであり、独立した裏表紙編集は追加していない。

## Task078 Best Shot保護

以下はmainとの差分が0であることを確認した。

- `app/(app)/dev/best-shot/actions.ts`
- `lib/best-shot/config.ts`
- `lib/best-shot/select.ts`

全group memberのunique ID取得・200件batch照会・Best Shot versionを維持している。既存の全member対応テストも通過。

## 検証

| チェック | 結果 |
| --- | --- |
| `node --test tests/*.test.mjs` | **1004 passed / 0 failed** |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS — 0 errors / 既存の12 warnings |
| `npm run build` | PASS |
| `git diff --check` | PASS |

テストには、所有外ID・空選択・無効な日付とページ数、全ペットの初期値、日本時間の期間境界、24/48/72Pの正確な見開き数、写真の重複・不足・alternate・低品質除外、40デザインの登録・左右配置・ノド安全性、36枚から48Pの計画、Best Shotの面積優先、全体監査、保存後の配置とCrop縦横比一致、80文字・絵文字・plain-text制約、Editorial PDFの本文24P＋独立した表紙・裏表紙＝26ページと長文のoverflow検査を含む。

古い作成UI・生成経路を固定していた2つの構造テストを今回の確定仕様に更新した。既存のViewer・Editor・Print・Billing等の回帰テストも通過した。

## 未検証・次の受入確認

この作業では実写真のアップロード、認証済みの作成→Viewer→Editor→Print操作、モバイル実機でのVisual QAは実行していない。自動テストの写真・解析データは合成fixtureであり、実際の写真品質・感情価値・待ち時間・Direct Acceptの証拠として扱わない。実行中に本番の写真やアルバムを作成していない。

Task078.3では実写真30〜40枚から24P / 48P、より多い写真から72Pを生成し、ペット別採用・最高評価写真の大きさ・Crop・本文のことば・白紙0・レイアウト多様性・表紙差し替え後の表示・実PDFを確認する。最低枚数付近のRhythm警告と写真選定の補正値は、その結果を元に調整する。性能改善全体はTask079.2で引き続き扱う。
