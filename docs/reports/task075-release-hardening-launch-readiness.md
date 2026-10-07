# Task075 Release Hardening / Launch Readiness

## Executive decision

UCHINOCO のアプリケーション実装は、初回 Production Release に必要な主要な安全境界と回帰検証を満たした。runtime dependency の critical/high advisory は 0、local/remote migration は一致、private Storage と既存 RLS/RPC 境界も維持されている。

ただし、Production 公開判定は **条件付き READY** とする。公開前に管理画面での環境変数・バックアップ設定確認と、隔離したテストデータを使う変更系ブラウザ E2E、既存 visual benchmark の合格判定を完了する必要がある。Print commerce は provider 要件が確定するまで意図的に fail closed のままとする。

## Git baseline

- Task074 commit `04ba2f0402398c31ab4a7bcccd756cd2021c1137` が `origin/main` に存在することを確認した。
- 最新 `main` から `feature/task075-release-hardening-launch-readiness` を作成した。
- main への直接 commit / merge は行っていない。

## Dependency security

- Next.js / `eslint-config-next` を 16.3 系から **16.4.0** に更新し、固定した。
- lockfile の解決結果で `sharp 0.35.5`、`source-map-js 1.2.2`、修正版 `brace-expansion` を確認した。
- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities**。
- full `npm audit --audit-level=high`: **high 5 / critical 0**。残件は開発時のみ利用する `eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces@3.0.3` の連鎖に限定される。npm の唯一の自動修正案は `eslint-config-next@14.2.35` への breaking downgrade であり、Next 16.4.0 と非互換になるため `--force` は使用していない。Production runtime exposure はないが、修正版 upstream の追跡対象とする。

## Secrets and environment

- tracked env file は値を持たない `.env.example` のみで、`.env.local` は Git 管理外。
- service-role、Stripe secret/webhook secret、OpenAI key、Supabase secret/provider credential の hard-code は検出されなかった。
- Client Component から server-only secret module を import する経路は検出されなかった。
- `.env.example` に `PRINT_COMMERCE_MODE=disabled`、`PRINT_PROVIDER=mock`、`PRODIGI_ENV=sandbox` と空の `PRODIGI_API_KEY` を追記した。Production provider 条件が不足する場合は fail closed となる。

## Auth, RLS, RPC and Storage

- Task070/070.1 の owner/member/non-member/revoked-member 境界、Task071.1 の FREE/PLUS entitlement remote probe を再確認した。
- pets/photos/family/album/draft/order/analytics は既存 RLS/RPC を維持し、service role を一般画面に導入していない。
- remote migration history は local と全件一致し、`db push --dry-run` は `upToDate: true`、pending 0。
- remote Storage 設定を read-only 監査した。
  - `pet-avatars`: private、5 MB、JPEG/PNG/WebP
  - `pet-photos`: private、10 MB、JPEG/PNG/WebP
  - `pet-photo-thumbnails`: private、1 MB、WebP
  - `print-files`: private、50 MB、PDF
- signed URL の永続保存や public bucket 化は行っていない。revoked member、cross-pet path、owner print-file 境界は既存 policy/test の対象である。

## Billing and Print safety

- Stripe webhook は署名検証、server-side price authority、event ordering、pending-only transition、idempotency、album/order/print snapshot binding を維持する。
- webhook log から raw event/order identifiers、provider/DB error message を除去し、stage/event type/safe code のみにした。
- success URL や client plan 値だけで paid/PLUS へ昇格する経路はない。
- Print commerce は既定で disabled、provider は mock、LIVE requirements 不足時は fail closed。
- immutable print snapshot、paid/ordered album protection、duplicate fulfillment guard、unknown provider result と blind retry 禁止を維持した。
- 実課金・実 provider 注文は実施していない。

## Error, loading, route and legal hardening

- authenticated app 共通の loading UI と recoverable error boundary を追加した。
- root fatal error、Not Found、robots を追加した。ユーザー画面に raw DB/stack/secret を表示しない。
- `/dev/*` 共通 layout を追加し、Production では server-only `UCHINOCO_INTERNAL_USER_IDS` allowlist が空または不一致なら Not Found になる。通常の認証も必須。
- global response headers に `nosniff`、`DENY` frame policy、strict referrer policy、camera-only permissions policy を追加した。
- title、description、favicon、Privacy Policy、利用規約と既存導線を確認した。robots は public/legal のみ allow し、app/auth/dev/api route を disallow する。

## Mobile, performance and browser verification

- 認証済み read-only browser で Home、Search、Album Viewer、Editor、Family、Anniversary、Print Preview を確認した。
- 375 / 390 / 430 px で主要画面に意図しない horizontal overflow はなく、Bottom Navigation と主要 CTA の切れ・致命的 UI error は検出されなかった。
- 390 px の Album Viewer と Print Preview では signed thumbnail/preview が読み込まれ、写真・本文・ナビゲーションが正常に表示された。Print Preview の表紙と見開きにも明白な重なりや欠落はなかった。
- private media は thumbnail/preview を優先し、表示対象のみ signed URL を生成する既存設計を維持した。新しい Vision/OpenAI call、全件取得、original 強制取得は追加していない。
- 開発 console では一部 signed thumbnail が LCP 候補になった際の `loading="eager"` 推奨 warning が残る。機能障害や private URL leak の永続化ではないが、初期表示画像の優先付けを POST-LAUNCH 改善とする。
- 変更系ブラウザ操作（upload、decoration apply、candidate materialize、family revoke、checkout）は実ユーザーデータを変更するため、この監査では実行していない。

## Logging and abuse controls

- Production webhook log は安全な stage/code のみに制限した。token、signed URL、email/address、payload、secret、image path は出力しない。
- upload MIME/size、AI analysis、album generation/regeneration、invite、search、checkout には既存の entitlement、dedupe、fingerprint、ownership、page limit、idempotency guard がある。
- distributed/global rate limiter は未導入。現状の bounded operation と重複防止で無制限再処理を抑えるが、公開後の利用量に応じて shared rate limit を追加する。

## Data preservation and recovery

- photos、accepted/ordered/finalized albums、print snapshots、orders、family uploads、downgrade data の保存規則は変更していない。
- migration は再現可能で、今回 destructive migration や seed 実行はない。remote database reset は行っていない。
- Supabase project の backup/PITR retention と restore drill は repository から確認できないため、公開前に Dashboard/契約プラン側で確認が必要。

## Visual release gate

- 現在の認証済み Album Viewer / Print Preview は実データで表示でき、目視した表紙・mixed grid・見開きは ACCEPTABLE。写真の顔・耳、余白、タイトル、印刷可読性に明白な FAIL は見られなかった。
- ただし既存 shimau-ma 10項目 benchmark の正式な `PASS >= 8/10, FAIL = 0` 採点は、隔離fixtureを使った全 template（Hero/Story/Grid/Quiet/1/3/4/5 photo）比較まで完了していない。合格を推測せず Release Gate とする。

## Verification

- Focused release/security tests: **81 passed / 0 failed**。
- Full suite: **976 passed / 0 failed**。
- `npx tsc --noEmit`: passed。
- `npm run build` (Next.js 16.4.0, webpack): passed。sandbox の DNS 制限下では Google Fonts fetch が失敗したため、network access を許可した同一 build を再実行して成功。
- Task075 scoped ESLint: passed。`.env.example` を明示した際の「matching configなし」warning 1件のみ。
- Full `npm run lint`: failed。Task075外の既存4 source lint errors（effect内同期setState/ref render access）と、ignoredであるべき `supabase/.temp` 生成物が主因。Task075変更由来の error はないが、CIでfull lintを必須にするなら公開前に解消が必要。
- `git diff --check`: passed。
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities。
- full `npm audit --audit-level=high`: 5 high / 0 critical（dev-only lint chain）。
- build warning: Apple Silicon Mac 上で x86-64 Node/Rosetta 2。成果物生成は成功したが、開発性能のため arm64 Nodeへの移行を推奨。

## Release checklist

### READY

- Production runtime dependency critical/high: 0。
- Secrets hard-code/client exposure: detected none。
- Auth/RLS/RPC/private Storage: existing remote verification and regression tests pass。
- Stripe signature/idempotency/server authority: pass。
- Print commerce: fail closed、実注文なし。
- Migrations: local/remote一致、pending 0。
- Full tests、TypeScript、production build、scoped lint、diff check: pass。
- Dev route production guard、global error/loading/not-found、security headers、robots: implemented。
- 認証済み read-only mobile screen audit: no major breakage。

### RELEASE GATE

- **P1:** 隔離fixture/テストアカウントで Album→Editor→Print→PDF、Decoration apply/undo/redo、upload→analysis→candidate、new-photo placement、Annual、Family upload/seen/revoke、FREE/PLUS advanced search の変更系 E2Eを完走する。
- **P1:** shimau-ma visual benchmark を同一fixtureで正式採点し `FAIL=0`, `PASS>=8/10` を記録する。
- **P1:** Production host の必須env、Auth redirect URL、runtime logs/500率、Supabase backup/PITR/restore procedure を管理画面で確認する。
- **P1（live Printを公開する場合のみ）:** provider credentials/spec/sandbox proofを満たし、Print release gateを解除する。満たさない場合は `PRINT_COMMERCE_MODE=disabled` のまま公開する。
- **CI gate:** full lint の既存4 source errorsと `supabase/.temp` lint対象問題を解消またはlint設定で正しく除外する。

### POST-LAUNCH

- dev-only `braces` advisoryのupstream修正版を追跡し、Next 16 compatibleな修正が出たら更新する。
- 初期表示thumbnailのLCP priority/eager指定を画面ごとに調整する。
- shared/distributed rate limiting、external error monitoring、alertingを利用量に応じて導入する。
- arm64 Nodeへ移行してRosetta build warningを解消する。

## Remaining blockers

アプリコードの既知P0 blockerはない。一般公開の最終GOには上記P1 operational/browser/visual gateの実施が必要である。Printを同時公開しない場合は disabled のまま安全に除外できる。
