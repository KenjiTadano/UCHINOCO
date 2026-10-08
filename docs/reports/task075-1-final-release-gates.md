# Task075.1 Final Release Gates

## Final decision

**NO-GO**

アプリケーションの自動検証、full lint、隔離した Photo Intake と Album の主要変更フローは通過した。一方、初回 Production Release の必須条件である Production 環境設定、Backup / PITR、Production logs、および shimau-ma の全構成 visual benchmark を、この実行環境から合格として確認できなかった。未確認を推測で PASS にしないため、現時点の公開判定は NO-GO とする。

Print commerce は provider release gate が未確認であり、公開時は `PRINT_COMMERCE_MODE=disabled` が必須である。これは UCHINOCO 本体とは分離できるが、上記の環境・バックアップ・visual gate が残るため、現時点では `GO WITH PRINT DISABLED` にも進めない。

## Branch and baseline

- branch: `feature/task075-1-final-release-gates`
- baseline: `daa129be69398839e392cb7c09c8e1e0938cf977`
- 作業開始時に baseline と `origin/main` が一致し、Task075 が main に取り込まれていることを確認した。
- main への直接 commit / merge は行っていない。

## Full lint cleanup

次の既存 error を、挙動を隠す disable ではなく state 設計の修正で解消した。

- Smart Crop Lab: effect 内の同期 state reset を廃止し、AI crop とユーザー調整値を分離した。
- Cover editor: render 中の ref 更新を effect に移した。
- Page polish controls: spread/layout/text slot に紐づく caption state とし、effect 内 reset を廃止した。選択 UI の ARIA role も button semantics に合わせた。
- Album generating screen: pending 開始時の reset を timer lifecycle 内へ移した。
- Supabase CLI の生成物 `supabase/.temp/**` を ESLint 対象外にした。

結果: `npm run lint` は **0 errors / 12 warnings**。warning は開発用 Lab と既存 Album ページの `<img>`、既存 unused 引数に限定され、今回の release blocker ではない。

## Isolated browser E2E

専用 OWNER / MEMBER アカウントと専用 pet を作り、実ユーザーデータを使用せず確認した。終了時に専用 Storage object、DB fixture、両 Auth user を削除した。

### PASS

- pet 作成
- 12枚の fixture upload
- `storage_path` / thumbnail / content hash 保存
- background analysis runner の起動
- AI Album 作成
- Viewer 表示
- Editor で layout を 2-Up Vertical から 2-Up Horizontal へ変更
- 保存後 reload でも変更が保持されること
- Print Preview 表示
- PDF生成 route が成功し、PDF responseへ遷移すること
- checkout / provider order / 実課金を実行していないこと

解析結果は semantic 11 completed / 1 failed、Photo Intelligence / Subject Geometry は各10件まで生成された。失敗1件は UI 全体を停止せず Album 作成へ進めたが、全写真解析成功の証明にはならない。

### PARTIAL / NOT COMPLETED

- Decoration: recommendation panel は表示したが、隔離Albumでは `装飾なし` のみが安全な推薦となり、装飾要素の apply / undo / redo / reload / print を実データで完走できなかった。
- New Photo / Smart Placement: upload後の suggestion / selective add / placement / version undo-redo を同一隔離Albumで完走していない。
- Annual: 年間 eligibility を満たす安全な複数月・複数年 fixture を作らず、materialize / double-open は未確認。
- Family: Task070.1 の実DB owner/member/revocation probe は既存報告で PASS だが、今回のブラウザ上の invite / accept / member upload / FAMILY_NEW / revoke は未完了。
- FREE / PLUS: Task071.1 の実DB entitlement probe は既存報告で PASS だが、今回のブラウザ上での plan切替一連操作は未完了。

このため「isolated authenticated change E2E」は部分合格であり、最終 release gate としては未達である。

## Visual benchmark

`docs/benchmarks/shimau-ma/` を upload fixture として使用したが、生成された隔離Albumは2枚・1 Storyの構成となった。Print Previewには写真のない見開き warning も表示されたため、同一fixture Albumで COVER / HERO / STORY / GRID / QUIET / 1 / 3 / 4 / 5-photo をすべて目視採点する条件を満たしていない。

| # | 項目 | 判定 | 理由 |
|---|---|---|---|
| 1 | Hero clarity | WARN | cover は表示されたが独立HERO構成を確認できず |
| 2 | face / ears crop | PASS | 生成された表紙・2-photoページで致命的欠損なし |
| 3 | 1-photo composition | FAIL | 同一fixture Albumに対象構成なし |
| 4 | 3-photo composition | FAIL | 同一fixture Albumに対象構成なし |
| 5 | 4-photo composition | FAIL | 同一fixture Albumに対象構成なし |
| 6 | 5-photo composition | FAIL | 同一fixture Albumに対象構成なし |
| 7 | whitespace | PASS | 表紙と2-photoページの余白は読みやすい |
| 8 | density rhythm | WARN | 2枚のみでAlbum全体のrhythm評価不可 |
| 9 | text/date breathing room | PASS | 表紙、日付、タイトルに明白な衝突なし |
| 10 | print readability / emotional coherence | FAIL | 写真のない見開き warningがあり正式合格不可 |

- PASS: **3 / 10**
- WARN: **2 / 10**
- FAIL: **5 / 10**
- release condition `FAIL=0` かつ `PASS>=8`: **未達**

単体・統合テストでは 1/3/4/5-photo template、Smart Layout、Smart Crop、Album Rhythm の回帰は通っているが、正式な visual benchmark の代替とはしない。

## Production environment

### Confirmed

- repository の `.env.example` は Production 必須キー名を列挙し、Print は disabled / mock を既定にする。
- local verification environment では Supabase / OpenAI / Stripe server key の必須設定が存在する。値は記録していない。
- service-role / OpenAI / Stripe secret は server-only module / Server Action / Route Handlerから使用され、`NEXT_PUBLIC_*` として公開していない。
- remote Supabase project へ接続でき、migration は local / remote 一致、pending 0。
- private buckets:
  - `pet-avatars`: private
  - `pet-photos`: private
  - `pet-photo-thumbnails`: private
  - `print-files`: private

### Not confirmed

- Vercel CLI の Production project context / authenticationを取得できず、Productionの必須env存在を確認できなかった。
- Auth Site URL / redirect URLs
- Stripe webhook endpoint と Stripe mode
- Production `PRINT_COMMERCE_MODE`
- Production provider mode / internal allowlist
- Production deployment logs、500 rate、継続的 auth/webhook/DB error

未確認項目は値を推測せず release blocker とする。

## Backup / PITR / Recovery

repository と Supabase CLI から migration の再現性と pending 0 は確認した。Production DB reset / restore は実施していない。

以下は Supabase Dashboard / plan の管理情報へアクセスできず未確認である。

- scheduled backup enabled
- retention period
- PITR availability
- restore procedure と直近 restore drill

Task075.1 の定義に従い、Backup / PITR 未確認は最終 GO blocker とする。

## Print release decision

- Preview と PDF generation は隔離Albumで PASS。
- 実 checkout、実決済、実 provider order は実施していない。
- provider production requirements は未確認。
- Productionでは `PRINT_COMMERCE_MODE=disabled` を維持する必要がある。

本体の他ゲートが通れば `GO WITH PRINT DISABLED` が可能だが、今回は visual / env / backup / browser E2E の未達があるため全体判定は NO-GO。

## Automated verification

- full suite: **976 passed / 0 failed**
- `npx tsc --noEmit`: **PASS**
- `npm run build` (Next.js 16.4.0 / webpack): **PASS**
- `npm run lint`: **PASS, 0 errors / 12 warnings**
- `git diff --check`: **PASS**
- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities**
- `npx supabase migration list`: local / remote一致
- `npx supabase db push --dry-run`: up-to-date、pending 0
- build warning: Apple Silicon上でx86-64 Node / Rosetta 2。成果物生成は成功したが、arm64 Nodeへの移行を推奨。
- test warning: Node ESM判定による `MODULE_TYPELESS_PACKAGE_JSON` warning。テスト結果への影響なし。

## Remaining blockers

1. 同一 shimau-ma fixture Albumで全10 visual項目を再現し、`FAIL=0`, `PASS>=8` を満たす。
2. Production Vercel env / Auth redirects / Stripe webhook mode / Print disabled / logsを管理画面で確認する。
3. Supabase backup retention / PITR / restore procedureを管理画面で確認する。
4. 隔離browserで Decoration、New Photo Placement、Annual、Family、FREE/PLUS の変更系E2Eを完走する。

P0の新規 data-loss / auth bypass / payment bypass は今回検出していない。ただし上記は Task075.1 が要求する P1 release gate であり、公開前に解消または証跡付き確認が必要である。
