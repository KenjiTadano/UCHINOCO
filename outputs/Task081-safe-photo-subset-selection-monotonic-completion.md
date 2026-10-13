# Task081 — Safe Photo Subset Selection & Monotonic Completion レポート

## 1. 根本原因の分析 (Root Cause)

### 背景と事象
Production / Preview 検証（実写真・24P、12見開き）において：
- **写真23枚解析済み時点**: `unrecoveredCount = 0`（全見開きが安全に完成し、アルバム永続化・プレビュー到達に成功）
- **写真24枚解析済み時点**: `unrecoveredCount = 1`（Spread 7 で安全なレイアウトが見つからず、`action_required` となり失敗）

### 根本原因
従来の設計では、`eligibleReady`（利用可能な写真）が増加すると、`planEditorialAlbum` がその枚数をすべてスプレッドに消化しようとスプレッド密度や割り当てを再計算していた。
その結果、「23枚の時点で存在していた安全な見開き構成」が、24枚目が加わったことで崩され、特定の写真の組み合わせ（顔・頭部が写真端に近い写真やアスペクト比の厳しい写真）が同一スプレッドに集中してセーフティ基準（トリミング安全性、ガッタークリアランス）を満たせなくなるという、**非単調な退行（Monotonicity Violation）** が発生していた。

---

## 2. 設計原則 (Monotonic Completion Principle)

1. **単調性の保証**:
   - $N$ 枚で安全解（`unrecoveredCount = 0`）が作れる場合、$N+1$ 枚になったときも「新写真を使って安全に完成できる場合のみ採用し、そうでなければ安全な $N$ 枚相当の構成（あるいは別の安全なサブセット）を採用する」。
   - 「写真が増えたことで、作れていたアルバムが作れなくなる」事態を確実に防ぐ。
2. **全写真消化を目的としない**:
   - アルバムのゴールは「全候補写真の強制消化」ではなく、「安全で自然なアルバムの完成」。
   - 条件に応じて未使用写真（`unused photos`）が残ることを正常系として設計。
3. **安全基準の不緩和**:
   - 顔・頭・耳のトリミング安全性、ガッタークリアランス、被写体スケール、No-Crop 安全性などの閾値は一切緩和しない。

---

## 3. 実装内容

### ① Safe Photo Subset Selection モジュール ([lib/album-draft/selection.ts](lib/album-draft/selection.ts))
- **`scorePhotoQualityAndSuitability`**:
  - 全体品質スコア（Best Shot）をベースにしつつ、被写体クリッピングリスク（`sourceSubjectClipped`）、枠適合性（`portraitCropSafe`, `landscapeCropSafe`, `squareCropSafe`）を評価し、レイアウト破綻リスクの高い写真をスコア上で減点。
- **`planEditorialAlbumWithSubset`**:
  - 除外写真 ID セット（`excludedPhotoIds`）を受け取り、決定論的に安全な候補写真サブセットでアルバムスプレッドを計画。
- **`identifyUnsafeSpreadRemovals`**:
  - リカバリで修復できなかったスプレッド（unsafe spread）に割り当てられている写真の中から、適合度が低くクリッピングリスクが高い写真を優先的に除外候補として特定。
- **有界探索（Bounded Search）**:
  - 最大試行回数を `MAX_SUBSET_SEARCH_ATTEMPTS = 4` に制限し、組み合わせ爆発やタイムアウト（80秒バジェット超過）を防止。

### ② アルバム生成アクションの統合 ([app/(app)/pets/[petId]/album/new/actions.ts](app/(app)/pets/[petId]/album/new/actions.ts))
- 通常のリカバリで `unrecoveredSpreadIndices` が残った場合、未回復スプレッドに寄与している低適性写真を特定。
- その写真を一時的に未使用プール（unused）へ残した代替サブセットで有界探索を実行。
- `unrecoveredCount === 0` となる安全サブセットが得られた時点でそれを採用し、アルバム永続化・プレビュー遷移を完走。

### ③ 診断構造化ログ ([scripts/vercel-album-logs.mjs](scripts/vercel-album-logs.mjs))
- `photoSubsetSelection` イベントログを出力：
  - `eligiblePhotoCount`, `selectedPhotoCount`, `unusedPhotoCount`
  - `subsetAttemptCount`, `subsetSuccessCount`
  - `droppedForLayoutSafetyCount`, `initialUnrecoveredCount`, `finalUnrecoveredCount`
- 個人情報（PII・写真ID）は一切含めない。

---

## 4. 検証結果 (Tests & Verification)

### ① 新規単体テスト ([tests/task081-safe-photo-subset-selection.test.mjs](tests/task081-safe-photo-subset-selection.test.mjs))
- **Case A (未回復写真を未使用に残すケース)**:
  - 23枚で `unrecoveredCount = 0` の環境に、クリッピングリスクの高い24枚目を追加。
  - サブセット選定により問題写真を未使用プールに残すことで、`unrecoveredCount = 0` で完成することを検証 → **PASS**
- **Case B (新写真の方が優れており既存の別写真を未使用にするケース)**:
  - 24枚目の写真が既存写真よりも高品質・高適合度である場合、24枚目を採用し、既存の低品質写真を未使用にして `unrecoveredCount = 0` で完成することを検証（機械的な「末尾写真ドロップ」ではないことを実証） → **PASS**
- **決定論性（Determinism）**:
  - 同一入力に対して常に同一のサブセットおよびスプレッドが生成されることを検証 → **PASS**
- **品質・適合度スコアリング**:
  - クリッピング・不適合写真へのペナルティ計算を検証 → **PASS**

### ② 全リポジトリ検証
- **リポジトリ全テスト**: `node --test tests/*.test.mjs` → **1,094 件全件パス（0 fail）**
- **TypeScript 型チェック**: `npx tsc --noEmit` → **エラー 0 件**
- **ESLint**: `npm run lint` → **エラー 0 件**
- **Next.js 本番ビルド**: `npm run build` → **成功**
- **差分空白チェック**: `git diff --check` → **エラー 0 件**

---

## 5. Definition of Done の達成

- 候補写真数が増加しても、既に存在していた安全なアルバム完成解を失わない単調性フォールバック（Monotonic Completion）を確立。
- 24枚目の候補が加わった場合でも、不要・危険な写真を未使用に残すことで、安全解（`unrecoveredCount = 0`）を維持してプレビューへ到達可能。
- 安全基準（トリミング閾値等）の緩和や、組み合わせ爆発を招く全探索は行わず、有界な選定レイヤーにより高速かつ安定した動作を実現。
