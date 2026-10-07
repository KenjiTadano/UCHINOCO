# Task061 — Album Quality Feedback Loop

## 1. Analytics Audit

Task060 の `album_analytics_events` と Accept 時の集約 payload から、生成数、閲覧、Accept、編集距離、Accept までの時間、再生成、印刷プレビュー、Checkout、Layout/Crop keep、Decoration の各指標を算出できることを確認した。Task061 では新しいイベントやDB列を追加せず、この既存データだけを利用する。

## 2. Quality Funnel

`Album Generated → Viewed → Accepted → Print Preview → Checkout Started` を定義した。同じ album / draft から複数の閲覧イベントが記録されてもファネル件数が膨らまないよう、`draft_version_id`、次に `album_id` を単位として重複排除する。各段階は件数と直前段階からの到達率を表示する。

## 3. Acceptance Breakdown

Acceptを `DIRECT_ACCEPT`、`LIGHT_EDIT_ACCEPT`、`MEDIUM_EDIT_ACCEPT`、`HEAVY_EDIT_ACCEPT` に分解する。Primary KPI は Direct Accept Rate、Secondary KPI は Average Edit Distance とした。

## 4. Edit Breakdown

Accept済みalbumを母数に、photo swap、layout、crop、text、stamp、decoration、backgroundの各変更が1回以上発生した割合を集計する。本文や変更内容そのものは取得・表示しない。

## 5. Layout Quality

Accept payloadの `ai_layout_kept_count / ai_layout_total` からKeep Rateを算出し、`selected_rank_counts` から #1〜#4 / other の採用数を表示する。Task060 payloadにはphoto count別の集計軸がないため、今回は推測せず全体集計のみとした。

## 6. Crop Quality

Accept payloadの `ai_crop_kept_count / ai_crop_total` によるKeep Rateと、`album_crop_changed` の modified / reset 件数を表示する。layout family / photo count別は既存イベントに安全な軸がないため未実装。

## 7. Decoration Quality

shown、previewed、applied、rejected、resetを集計し、Preview / Apply / Reset Rateを算出する。`style_id` が記録されているイベントはstyle別にも集約する。既存のshownイベントにstyleがない場合は `UNKNOWN` として扱い、内容を推測しない。

## 8. Problem Detection

`lib/album-quality.ts` の設定値に基づき、LOW_DIRECT_ACCEPT、HIGH_LAYOUT_CHANGE、HIGH_CROP_CHANGE、HIGH_PHOTO_SWAP、LOW_DECORATION_ACCEPT、HIGH_DECORATION_RESET、HIGH_HEAVY_EDIT、LOW_PRINT_INTENTを決定論的に検出する。AI APIは使用しない。

## 9. Sample Guard

初期最小サンプルを `n=10` とした。母数が10未満、または値が存在しない場合は `INSUFFICIENT_DATA` とし、改善シグナルを出さない。状態は `INSUFFICIENT_DATA / HEALTHY / WATCH / NEEDS_ATTENTION` の4段階。

## 10. Improvement Recommendations

シグナルごとに、Smart Layout、Smart Crop、Photo Selection / Best Shot、Decoration Recommendation、Accept後の印刷導線など、次に確認する領域を固定ルールで提示する。編集UIを隠したりAcceptを強制したりする提案は行わない。

## 11. Dashboard

開発専用 `/dev/album-quality` を追加した。7日、30日、90日、すべて（初期値）をGET queryで切り替えられる。イベントは1000件ずつページング取得し、各指標の `n`、Actual、初期Target、状態、ファネル、内訳、改善シグナル、Task055/058/059/060の改善履歴を表示する。productionでは `/home` へredirectし、一般ナビゲーションには追加していない。

## 12. Privacy

Server Componentはログインユーザー自身のイベントだけを明示的に `user_id` で絞り、既存RLSも併用する。画面と集約結果にはpet name、photo、caption、free text、signed URL、email、user IDを含めない。album / draft IDは重複排除のためサーバー内部だけで使い、出力しない。

## 13. Browser Verification

ローカルの `/dev/album-quality` へ直接アクセスし、未認証時に `/login` へredirectされることを確認した。手元のブラウザには認証済みセッションがなかったため、実データを用いた画面目視は未実施。Task060 migration適用後の認証済み開発環境では、空状態、期間切替、n表示、シグナル表示を確認する。production buildではrouteが `/home` へredirectされる実装を維持する。実ユーザー情報を含む画面キャプチャは作成していない。

## 14. Tests

`tests/album-quality.test.mjs` に以下を追加した。

- empty analytics
- insufficient sample / small nでのfalse signal防止
- direct accept / edit severity / average edit distance
- edit breakdown / layout keep / crop keep / rank
- decoration accept / style集計
- print funnelと重複閲覧排除
- date range
- aggregate/dashboardのprivacy guard

全suiteを `node --experimental-strip-types --test tests/*.test.mjs` で実行し、819件すべて成功した。NodeがTypeScriptファイルをES moduleとして再解析する既存の `MODULE_TYPELESS_PACKAGE_JSON` warningは出るが、失敗はない。

## 15. TypeScript

`npx tsc --noEmit` は成功。

## 16. Build

`npm run build` はNext.js 16.3.5 / webpackで成功し、`/dev/album-quality` が動的routeとして生成された。Apple Silicon上でx86-64 Nodeを利用していることによる既存のRosetta 2 warningのみあり。

## 17. Lint

`lib/album-quality.ts`、dashboard page、testの変更範囲ESLintは成功。`git diff --check` も成功。

## 18. Known Issues

- Task060 migrationが未適用の環境では、安全な「データを収集中です」を表示し、過去データを推測補完しない。
- photo count / layout family別比較はTask060 payloadに軸がないため未対応。
- shown時点でstyle_idを持たないDecorationイベントはstyle別母数が `UNKNOWN` になる。
- 開発routeの実データ目視には認証済みセッションとTask060 migration適用済み環境が必要。

## 19. commit / push

Task061ではcommit / pushを実施しない。既存の未commit差分を維持する。
