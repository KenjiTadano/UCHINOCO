# Task060 — Album Acceptance & Edit Distance Analytics

実施日: 2026-10-02

## 1. KPI Definitions

- **Album Accept Rate**: `album_accepted / album_generated`
- **Direct Accept Rate**: `DIRECT_ACCEPT / album_generated`
- **Edit Distance**: AI初稿の不変列とAccept時点の有効値との差分を重み付き集計
- **Time to Accept**: `album_generated.created_at` から `album_accepted` までの秒数
- **Regenerate Rate**: `album_regenerated / album_generated`
- **Print Intent Rate**: `print_preview_opened / album_generated` と `checkout_started / album_generated`

過去Draftにfake eventは作らず、Task060導入後の操作だけを対象とする。

## 2. Event Model

実装したイベント:

- `album_generated`
- `album_viewed`
- `album_accepted`
- `album_edit_started`
- `album_layout_changed`
- `album_crop_changed`
- `album_photo_swapped`
- `album_text_changed`
- `album_decoration_changed`
- `album_background_changed`
- `album_regenerated`
- `print_preview_opened`
- `checkout_started`
- `decoration_recommendation_shown`
- `decoration_previewed`
- `decoration_applied`
- `decoration_rejected`
- `decoration_reset`

## 3. Database

新規 `public.album_analytics_events`:

- `id uuid`
- `user_id uuid`
- `album_id uuid`
- `draft_version_id uuid nullable`
- `event_type text`
- `event_key text nullable`
- `event_data jsonb`
- `created_at timestamptz`

FKはuser / album / draft削除へcascadeする。イベントはappend-onlyで、authenticated roleにはSELECT / INSERTだけを許可する。

## 4. RLS

RLSを有効化し、次を両方満たすownerだけがSELECT / INSERTできる。

- `user_id = auth.uid()`
- 対象albumの`owner_user_id = auth.uid()`

指定されたdraft versionが対象albumに属することもINSERT policyで検査する。service roleやRLS bypassは使用しない。

## 5. Privacy

保存するのはevent種別、件数、boolean、数値差分、layout / style識別子などだけ。次は保存しない。

- 写真binary
- Storage path / signed URL
- caption全文
- user free text全文
- AI prompt全文
- Cookie / access token

Accept eventのtextは変更件数だけで、本文やhashもAnalytics tableへ複製しない。

## 6. Accept Tracking

Complete画面の「このままでOK」をServer Action化した。サーバー側でauth、pet / album所有権、active draftを再確認し、差分集計後に`album_accepted`を記録してViewerへredirectする。

記録項目:

- category / severity
- edit count / edit distance
- time to accept
- 種別ごとの変更件数
- AI layout / cropのkeep数とtotal
- selected rank集計
- decoration applied有無

Analytics失敗時もViewer遷移は継続する。

## 7. Edit Distance

weightは`lib/album-analytics.ts`で一元管理。

- photo swap: 3
- layout: 2
- crop: 1
- text: 1
- stamp: 0.5
- decoration: 0.5
- background: 0.5

AI初稿の`ai*`列は既存DB guardで不変のため、別snapshotへ写真内容を複製せず比較できる。

## 8. Severity

- `NONE`: 0
- `LIGHT`: 0超〜2以下
- `MEDIUM`: 2超〜7以下
- `HEAVY`: 7超

Accept categoryはそれぞれ`DIRECT_ACCEPT`、`LIGHT_EDIT_ACCEPT`、`MEDIUM_EDIT_ACCEPT`、`HEAVY_EDIT_ACCEPT`。

## 9. Smart Layout Metrics

layout変更イベントへreset / layout idを保存する。Accept時にAI layout kept数、total、選択候補rank（1〜4 / other）のaggregateを保存し、AI #1維持率を計算可能にした。

## 10. Crop Metrics

crop変更イベントは`modified` / `reset`を保存する。Accept時にAI crop kept数 / totalを保存する。

## 11. Decoration Metrics

Task059 UIでshown、previewed、applied、rejected、resetを記録する。自由文や画像内容は含めずstyle idだけを保存できる。通常のstamp / decoration / background操作も変更イベントとして記録する。

## 12. Print Intent

- Print Preview GET: `print_preview_opened`
- 注文商品選択へ進む確定処理: `checkout_started`

Stripe決済完了や課金処理は変更していない。

## 13. Dashboard Foundation

`get_album_analytics_summary()`を追加した。RLSが適用される`SECURITY INVOKER`関数で次を返す。

- generated albums
- direct / any accept rate
- average edit distance
- average time to accept
- AI layout #1 keep rate
- crop keep rate
- decoration accept rate
- print preview rate
- checkout start rate
- regenerate rate

本番ユーザー向けUIは追加していない。

## 14. Duplicate Protection

`(user_id, album_id, event_type, event_key)`のpartial unique indexを使用する。page refresh由来のview / edit / printイベント、同じaction sequenceの再送を重複登録しない。Postgres `23505`は成功相当として扱う。

## 15. Tests

- direct accept
- edited accept
- edit distance NONE / LIGHT / MEDIUM / HEAVY
- layout rank
- crop keep
- decoration / photo selection集計
- schema / RLS / append-only / dedupe
- failure non-blocking
- generated / accept / print / checkout / edit event wiring
- 既存album persistence / page editor / print回帰

全test suite: **811 passed / 0 failed**。

## 16. Migration

追加:

`supabase/migrations/20261002120000_album_analytics_events.sql`

`npx supabase db push --dry-run`成功。remoteへは未適用で、dry-runはこのmigration 1件だけを適用候補として報告した。

## 17. TypeScript

`npx tsc --noEmit`: PASS。

Remote適用後、通常のSupabase型生成フローで`lib/supabase/database.types.ts`を再生成すること。未適用schemaを手書きで生成型へ混ぜないため、現時点では汎用SupabaseClient境界を使用した。

## 18. Build

`npm run build`: PASS。Next.js 16.3.5 / webpackで全route生成成功。

## 19. Lint

Task060変更範囲のESLint: PASS（warning / error 0）。

## 20. Known Issues

- Migrationはまだremote未適用。その状態ではevent insertは安全に失敗し、製品操作は継続する。
- FREE / PLUS cohortは安全なplan情報源が現schemaで確認できなかったため保存していない。
- pet count / album size / photo countは生成イベントのpet / photo / spread countまで対応。アカウント全体pet countは保存していない。
- Dashboard UIは範囲外。summary RPCだけを提供。
- 外部Analytics SDKは追加していない。
- Build時に既存のRosetta 2警告があるがbuildは成功。

## 21. commit / push

commit / pushは実施していない。
