# Task067 — Release Packaging Plan

commit / push はしていない。削除もしていない。適用済み migration は書き換えていない。

判定: **READY WITH WARNINGS**

Task066 の BLOCKER / HIGH は 0 のまま。この Task で見たのはパッケージング上の問題だけ。

## 在庫

| 区分 | 数 |
| --- | ---: |
| tracked modified | 38 |
| untracked | 443 |
| うち source（app/lib、dev 以外） | 154 |
| うち dev routes | 35 |
| うち tests | 22 |
| うち migrations | 8 |
| うち docs | 174 |
| うち design screens（リポジトリ直下） | 27 |
| うち public assets | 18 |
| うち print fonts | 2 |
| うち local scripts | 2 |

tracked の内訳は source 34 と、`README.md` / `.env.example` / `package.json` / `package-lock.json`。

`git diff --stat` は 38 files、+9236 / -2239。大きい tracked 差分は `app/globals.css`、アルバム一覧、ホーム、検索、checkout form、注文完了、`database.types.ts`。

## 大きいファイル

| サイズ | パス | 扱い |
| ---: | --- | --- |
| 31.14 MB | `docs/UCHINOCO_v1.1_UI_Design.pdf` | Git に入れない。手元に残す |
| 18.92 MB | `docs/print-064-book.pdf` | Git に入れない。release evidence は手元または別管理 |
| 8.32 MB | `assets/print-fonts/KleeOne-Regular.ttf` | print commit に含める。PDF 描画に必要 |
| 4.10 MB | `assets/print-fonts/ZenKurenaido-Regular.ttf` | 同上 |
| 1 MB 超多数 | `docs/*-ui-compare/`、`docs/*-verify.png`、`UCHINOCO_UI_Screens/` | commit 対象外 |

フォント 2 つで約 12.4 MB。機能に必要なので入れる。2 つの PDF を入れると clone が約 50 MB 増える。ビルドには不要。

## Secret audit

値は出していない。

- `.env` / `.env.local` / `.env.production` は tracked でも staged 候補でもない。`.gitignore` は `.env*` を無視し、`.env.example` だけ例外。
- Stripe secret、OpenAI key、service role、webhook secret の実値は source / docs / tests に無い。
- `docs/task066-release-readiness-report.md` にあるのは `sk_test_` という接頭辞の説明だけ。
- `package-lock.json` の integrity hash は秘密ではない。
- `scripts/e2e-page-edit.mjs` と `scripts/e2e-cover-edit.mjs` はローカルの album UUID、Supabase project ref、`/tmp` の session ファイルを参照する。commit 対象外。
- スクリーンショットの OCR はしていない。住所やカードが見える可能性がある検証画像は commit しない。

## Fixture / debug

production logic に `localhost:3001`、ラボ用 album / order UUID、ペット名の固定は無い。

- `tests/checkout-site-url.test.mjs` は URL 組立の fixture として既存 ID を使う。テスト内だけ。
- `scripts/e2e-*.mjs` は上記のとおり除外。
- `TODO` / `FIXME` / `performance.now()` は `app` と `lib` に無い。
- `console.log` の新規追加は production source に無い。既存の webhook ログはサーバー側。
- `console.error` はサーバー側に残る。checkout の Stripe 失敗ログは `NODE_ENV !== "production"` のときだけ。解析保存失敗は `error.message` をサーバーログに出す。ブラウザへ stack、storage path、秘密は返していない。
- dev lab の action は例外メッセージを lab UI に返す。production では各 `/dev/*` が `/home` へ redirect する。

## Dev routes

10 ページ。すべて `(app)` layout のログイン必須の下にあり、`NODE_ENV === "production"` で `/home` へ redirect する。

`/dev/smart-crop`、`/dev/smart-layout`、`/dev/photo-intelligence`、`/dev/photo-grouping`、`/dev/best-shot`、`/dev/album-candidates`、`/dev/album-story`、`/dev/album-draft`、`/dev/album-persistence`、`/dev/album-e2e`。

production build の route 一覧には出る。未ログインではログインへ、production ではホームへ戻る。HIGH ではない。今回は削除しない。

## Migration

local 31 本と remote 31 本は timestamp が一致。mismatch 0。

今回 commit する未追跡 8 本は、すでに remote に適用済みの記録。tracked migration の diff は空。適用済みファイルは書き換えていない。

順序:

1. `20260927120000_album_draft_persistence.sql` — versions / spreads / frames
2. `20260927123000_fix_album_draft_guard.sql` — 同じ guard の修正
3. `20260928100000_photo_analysis_results.sql` — photos 前提。draft とは独立
4. `20260928150000_album_draft_covers.sql` — draft version 前提
5. `20260928180000_album_draft_polish.sql` — spread 前提
6. `20260928200000_album_text_suggestions.sql` — polish の text guard を置き換え
7. `20260928210000_album_print_snapshots.sql` — draft version 前提
8. `20260928220000_finalize_print_order.sql` — snapshots と orders 前提

FK / RPC は前提 table より後ろ。`database.types.ts` は手書きで、これらの table と RPC を含む。古い定義の削除差分は無い。commit 時は table ブロックごとに hunk を分ける。

`supabase db reset` は Docker なしでは未検証。remote 一致は reset の代わりにはしない。

## Docs 分類

Task066.1 の `docs/task066-1-evidence-inventory.md` を基準にした。削除はしていない。

残す候補（21）: `docs/task*.md`、`docs/v1.1-*.md`、`docs/release-066-*.png`、`docs/06_3_album_preview.png`、この packaging report。

除外候補:

- `docs/*-ui-compare/` と途中の `*-verify.png` / trace / e2e json（約 151）
- `docs/print-064-book.pdf`（18.92 MB）
- `docs/UCHINOCO_v1.1_UI_Design.pdf`（31.14 MB）
- `UCHINOCO_UI_Screens/`（27、デザイン原本。ファイル名に全角数字の重複が 1 つある）

task report は markdown だけなので、最後の docs commit にまとめてよい。画像の design baseline は `UCHINOCO_UI_Screens/` 側にあり、ui-compare 内の切り出しと混ざっている。今回の release commit には入れない。

## Gitignore

現状で足りているもの: `.env*`（`.env.example` 以外）、`.next/`、`node_modules/`、`*.pem`。

改善候補（今回は変えていない）:

- 検証 PDF と `UCHINOCO_UI_Screens/` を、誤って `git add` しないための ignore
- `docs/*-ui-compare/`

ignore に入れると一覧から消える。次の commit 作業の前に、除外方針が確定してからでよい。

## README / env example

README は Node 20.9+（監査 22.23.2）、install、dev、build、test、env 名、migration、Stripe test mode、local site URL、Docker なしでは `db reset` 未検証、を含む。

`.env.example` は名前と空値、および `NEXT_PUBLIC_SITE_URL=http://localhost:3000` の非秘密デフォルトだけ。不要な変数名は無い。

## なぜ 8 commit にしないか

page editor は history、polish、caption を同じ screen から import する。cover editor も history を import する。persistence の read は polish の row mapper を import する。これらを別 commit にすると、その時点の tree は build できない。

print snapshot の migration と、checkout / webhook の binding も同じ理由で 1 commit。

細かくすると壊れる境界は切らない。

## Commit 候補

まだ `git add` していない。

### Commit 1

`feat(ai): add the photo selection pipeline`

Files:

- `lib/smart-crop/`
- `lib/photo-intelligence/`
- `lib/photo-grouping/`
- `lib/best-shot/`
- `lib/album-candidates/`
- `lib/album-story/`
- `lib/album-generation/`
- `lib/album-draft/`
- `app/(app)/dev/` のうち上記 lab（album-persistence / album-e2e は Commit 4）
- `tests/smart-crop.test.mjs`
- `tests/photo-intelligence.test.mjs`
- `tests/photo-grouping.test.mjs`
- `tests/best-shot.test.mjs`
- `tests/frame-match.test.mjs`
- `tests/smart-layout.test.mjs`
- `tests/album-candidates.test.mjs`
- `tests/album-story.test.mjs`
- `tests/album-generation.test.mjs`
- `tests/album-draft.test.mjs`
- `package.json` / `package-lock.json` の `jpeg-js` だけ

Migrations: なし。

Reason: Task048–057。schema なしでテストできる。

### Commit 2

`feat(ai): persist photo analysis results`

Files:

- `supabase/migrations/20260928100000_photo_analysis_results.sql`
- `lib/photo-analysis/`
- `lib/photo-analysis-queue.ts`
- `app/api/photo-analysis/route.ts`
- `lib/supabase/database.types.ts` の `photo_analysis_results` と `save_photo_analysis_result`
- `tests/analysis-persistence.test.mjs`
- `tests/photo-analysis-queue.test.mjs`

Reason: Task058.2。queue の 503 修正は同じファイルの書き換えなので、ここへ含める。別 commit にすると queue が中間状態になる。

### Commit 3

`feat(ui): rebuild the signed-in shell`

Files:

- `app/globals.css`（分割しない）
- `app/layout.tsx`
- `app/(app)/layout.tsx`
- `app/(app)/_components/app-shell.tsx`
- `app/(app)/_components/pet-switcher.tsx`
- `app/(app)/_components/bottom-navigation.tsx`
- `lib/app-shell-view.ts`
- `lib/owner-pets.ts`
- `lib/pet-avatars.ts`
- `lib/memory-day-copy.ts`
- ホーム、思い出、検索、写真追加、アルバム一覧、注文フローの見た目
- `public/album/`
- `app/(app)/pets/[petId]/album/[albumId]/album-preview-screen.tsx`
- `app/(app)/pets/[petId]/album/[albumId]/album-complete-screen.tsx`
- `app/(app)/pets/[petId]/album/_components/book-spread.tsx`
- `lib/album-preview-spreads.ts`
- 生成中画面
- `package.json` / `package-lock.json` の `lucide-react` だけ

checkout の print snapshot 参照は入れない。hydration 用の Suspense は新しい `app-shell.tsx` の中にあるので、この commit に含む。

Reason: v1.1 の画面。後の editor がこの shell と lucide に依存する。

### Commit 4

`feat(album): persist and edit the AI draft`

Files:

- `supabase/migrations/20260927120000_album_draft_persistence.sql`
- `supabase/migrations/20260927123000_fix_album_draft_guard.sql`
- `supabase/migrations/20260928150000_album_draft_covers.sql`
- `supabase/migrations/20260928180000_album_draft_polish.sql`
- `supabase/migrations/20260928200000_album_text_suggestions.sql`
- `lib/album-persistence/`
- `lib/album-polish/`
- `lib/album-caption/`
- `lib/album-cover-templates.ts`
- `lib/album-cover-title.ts`
- `app/(app)/album-draft-service.ts`
- page editor、cover editor、album edit、history / polish controls
- `app/(app)/dev/album-persistence/`
- `app/(app)/dev/album-e2e/`
- `database.types.ts` の draft / cover / text / decoration / suggestion
- `tests/album-persistence.test.mjs`
- `tests/page-editor.test.mjs`
- `tests/cover-editor.test.mjs`
- `tests/editor-history.test.mjs`
- `tests/page-polish.test.mjs`
- `tests/album-caption.test.mjs`

Reason: Task058–063。screen が persistence、history、polish、caption を同時に import する。schema と service と test を分けない。

### Commit 5

`feat(print): bind finalized PDFs to checkout`

Files:

- `supabase/migrations/20260928210000_album_print_snapshots.sql`
- `supabase/migrations/20260928220000_finalize_print_order.sql`
- `lib/album-print/`
- `lib/album-order/`
- `assets/print-fonts/`
- `app/(app)/pets/[petId]/album/[albumId]/print/`
- `lib/print/pipeline/prepare-print-job.ts`
- `app/api/stripe/webhook/route.ts`
- checkout actions / page / form の print snapshot hunk
- `database.types.ts` の snapshot と finalize RPC
- `package.json` / `package-lock.json` の `@pdf-lib/fontkit`
- `tests/album-print.test.mjs`
- `tests/album-order-finalize.test.mjs`

Reason: Task064–065。snapshot なしの checkout binding は中間状態になる。

### Commit 6

`fix(release): keep checkout redirects on the canonical origin`

Files:

- `lib/checkout-session-helpers.ts`
- checkout actions の site URL hunk だけ
- `README.md`
- `.env.example`
- `tests/checkout-site-url.test.mjs`
- `tests/order-flow-header.test.mjs`

Reason: Task066.1。本番は `NEXT_PUBLIC_SITE_URL` だけ。development の loopback Host だけを fallback にする。

### Commit 7

`docs: record release reports`

Files:

- `docs/task058-implementation-report.md`
- `docs/task058-1-implementation-report.md`
- `docs/task058-2-implementation-report.md`
- `docs/task066-release-readiness-report.md`
- `docs/task066-1-evidence-inventory.md`
- `docs/task067-release-packaging-report.md`
- `docs/v1.1-*.md`
- `docs/release-066-*.png`
- `docs/06_3_album_preview.png`

Reason: 実装の記録。検証スクショと 2 つの大容量 PDF は入れない。

## Hunk split が必要なファイル

勝手に checkout / restore していない。

| ファイル | 分け方 |
| --- | --- |
| `package.json` | jpeg-js → 1、lucide-react → 3、fontkit → 5 |
| `package-lock.json` | 上と同じ順で依存ごとに含める。手で行分割しない |
| `lib/supabase/database.types.ts` | 解析 → 2、draft 系 → 4、print / finalize → 5 |
| `checkout/actions.ts` | print binding → 5、site URL → 6 |
| `checkout/page.tsx` | snapshot 読み取り → 5、それ以外の見た目 → 3 |
| `checkout/checkout-form.tsx` | `printSnapshotId` → 5、それ以外の見た目 → 3 |

`app/globals.css` は分割しない。Commit 3 に全体を入れる。

## Release に含めるもの

app / lib source、dev routes（redirect 付き）、8 migrations、tests、README、`.env.example`、print fonts、`public/album/`、上の docs commit。

## Release から外すもの

`docs/*-ui-compare/`、`docs/*-verify.png`、途中スクリーンショット、`docs/print-064-book.pdf`、`docs/UCHINOCO_v1.1_UI_Design.pdf`、`UCHINOCO_UI_Screens/`、`scripts/e2e-*.mjs`。

## Release summary

- 写真解析の結果を保存し、queue の 503 を止めた
- AI アルバム下書きを保存し、ページと表紙を編集できる
- undo / redo、テキスト、装飾、キャプション提案
- 確定下書きから印刷 PDF を作り、Checkout に snapshot を結ぶ
- Checkout の戻り先は、本番では canonical URL、開発では loopback だけ

## Known limitations

- `supabase db reset` は Docker なしでは未検証
- 印刷会社への本番送信は未接続
- `/dev/*` は production build に含まれる。ログイン後、production では `/home` へ戻る
- accessibility の全体監査は未実施
- 検証画像と 2 つの PDF は未 commit のまま残る
- editor commit は 1 本が大きい。import を切らないための判断

## 検証

- `npx tsc --noEmit`: exit 0
- `npm run build`: exit 0（Next.js 16.3.5 webpack）
- `node --test tests/*.mjs`: 681 pass / 0 fail
- `npm audit`: info 0 / low 0 / moderate 0 / high 0 / critical 0
- `git diff --check`: DIFF_CHECK_OK

staged は空。commit も push もしていない。
