# Task080 — Post-Recovery Completion Failure Diagnosis & Fix レポート

## 1. 課題と背景

### 報告された事象
Production 実写真・24P において、Vercel ログ上では以下の通り Layout Recovery が全スプレッド（12見開き）の修復に成功していた：
- `spreadCount`: 12
- `initialUnsafeSpreadCount`: 6
- `unrecoveredCount`: 0
- Photo × Frame Matching:
  - `initialUnsafeBeforeMatching`: 6
  - `initialUnsafeAfterMatching`: 6
  - `optimizedAssignmentCount`: 218
  - `legacyFallbackCount`: 0

しかし、ユーザーの UI 画面では依然として以下のエラーカードが表示され、Preview 画面へ到達していなかった：
> 「この条件ではアルバムを完成できませんでした」

---

## 2. 徹底調査結果（フロー各段階の分析）

### ① `albumLayoutRecovery` 後のサーバー側実行フロー
Vercel Production ログ（タイムスタンプ `1791857659710`、runId `9830a9f0-4ed0-44c9-9c07-5c5565ca3bd8`）の全41件のログトレースを精査した結果：
1. `09_layout_planning`: `completed` (427.5ms, 12 spreads, `unrecoveredCount: 0`)
2. `10_crop_calculation`: `completed` (37.11ms, 158 crops)
3. `12_album_row_creation`: `completed` (313.26ms, album id: `f317b7f9-a0d2-4e8b-b418-f39f0d29e5d5`)
4. `13_spread_page_persistence`: `completed` (3706.63ms, 12 spreads)
5. `14_cover_persistence`: `completed` (2494.55ms)
6. `15_metadata_persistence`: `completed` (604.86ms)
7. `16_redirect_preparation`: `completed` (0.07ms)
8. `finished`: `outcome: 'ready'`, `durationMs: 9928.53ms`
9. `albumAutoResume`: `generationCompleted: true`
10. HTTP レスポンス: **200 OK**
    - 返却ペイロード: `{ error: null, status: "complete", previewHref: "/pets/645f30fe-700f-441c-8878-6658caef0870/album/f317b7f9-a0d2-4e8b-b418-f39f0d29e5d5?view=preview" }`

**結論**: `unrecoveredCount = 0` の実行において、サーバー側のレイアウト計算、DB永続化、メタデータ保存、レスポンス返却は**100%成功**しており、サーバー起因の失敗は発生していなかった。

---

### ② 根本原因の特定: クライアント側（`AlbumCreateForm`）のステート保持と遷移競合

「この条件ではアルバムを完成できませんでした」という文字列はリポジトリ全体で [app/(app)/pets/[petId]/album/new/actions.ts](app/(app)/pets/[petId]/album/new/actions.ts#L443) の2箇所のみに定義されている。

Production ログの時系列（02:14:08 〜 02:14:31）を分析したところ、以下のレースコンディションと状態残留バグが判明した：

1. **先行リクエスト（02:14:15, runId `4c1b182a`）の失敗**:
   - 当時、写真解析（`/api/photo-analysis`）がまだ22枚しか完了しておらず、Spread 6の修復候補が不足して `unrecoveredCount: 1` で失敗した。
   - サーバーは `{ error: "この条件ではアルバムを完成できませんでした。別の写真で組み直すか、写真を追加できます。", status: "action_required" }` を返却。
   - クライアントの `handleResult` が React 状態 `recovery` にこのエラー文字列をセットし、UI にエラーカードを描画した。
2. **23枚目完了による自動再試行（02:14:19, runId `9830a9f0`）の発火**:
   - バックグラウンドで23枚目の写真解析が完了し、`observeReadyIntent` が自動的に `beginGeneration` を呼び出し、これが `unrecoveredCount = 0` で大成功した。
3. **バグ 1: `beginGeneration` での `recovery` 未クリア**:
   - `beginGeneration` が再実行される際、旧 `recovery` 状態を `null` にリセットしていなかったため、内部的に `recovery` が残留していた。
4. **バグ 2: `status === "complete"` での `recovery` 未クリア**:
   - サーバーから `{ status: "complete", previewHref }` を受け取った際、`handleResult` は `saveIntent(null)` と `router.replace(state.previewHref)` を呼ぶが、**`setRecovery(null)` を呼んでいなかった**。
5. **バグ 3: 生成中画面の即座なアンマウントとエラーカードの誤表示（最致命的）**:
   - [app/(app)/pets/[petId]/album/new/album-create-form.tsx](app/(app)/pets/[petId]/album/new/album-create-form.tsx#L273) の生成画面描画判定:
     ```ts
     // 修正前
     if (pending || (!recovery && (intent?.phase === "generating" || (intent && readiness?.state === "ready"))))
     ```
   - サーバーアクションが完了すると `pending` は `false` になり、`saveIntent(null)` により `intent` は `null` になる。
   - `state.status === "complete"` がこの条件に含まれていなかったため、**`AlbumGeneratingScreen` が即座にアンマウントされた**。
   - その結果、残留していた `recovery` 文字列に基づき、**`<RecoveryState description={recovery} />`（「この条件ではアルバムを完成できませんでした」）が画面に再描画された**。
6. **バグ 4: 遷移中のキャンセル・離脱**:
   - Next.js の `router.replace` は非同期の RSC 取得を行うため、プレビュー画面がマウントされるまでの間、ユーザーの画面には失敗メッセージが表示されたままとなった。
   - 画面上に表示された「作成条件を変更」「アルバム一覧へ戻る」などのリンクをユーザーが認識・操作してしまい、Preview への到達が阻害されていた。

---

## 3. 実装した修正内容

Layout Recovery エンジン自体には一切手を加えず（要求事項の遵守）、[app/(app)/pets/[petId]/album/new/album-create-form.tsx](app/(app)/pets/[petId]/album/new/album-create-form.tsx) における状態リセットと画面描画ガードを修正：

1. **`beginGeneration` 開始時のエラークリア**:
   - 生成開始時に `setRecovery(null)` を呼び出し、過去の試行で残ったエラーメッセージを確実に消去。
2. **`handleResult` 完了時のエラークリア**:
   - `state.status === "complete"` のハンドラ内で `setRecovery(null)` を呼び出し、クリーンな状態で遷移。
3. **`AlbumGeneratingScreen` の遷移中維持ガード**:
   - レンダリング条件に `state.status === "complete"` を追加：
     ```ts
     if (pending || state.status === "complete" || (!recovery && (intent?.phase === "generating" || (intent && readiness?.state === "ready")))) {
       return <AlbumGeneratingScreen ... />;
     }
     ```
   - これにより、サーバーがアルバム作成を完了してから Next.js がプレビューページをマウントするまでの間、フォームや過去のエラーカードがフラッシュ表示されず、生成中画面がシームレスに維持される。
4. **手動作成・ページ変更時のエラークリア**:
   - `requestCreation` および `selectSmallerPages` 内でも `setRecovery(null)` を追加。

---

## 4. 検証結果

- **新規単体テスト**: [tests/task080-post-recovery-completion.test.mjs](tests/task080-post-recovery-completion.test.mjs)
  - `AlbumCreateForm clears stale recovery and guards generating screen during complete navigation` → **PASS**
  - `server action correctly delivers completed status and previewHref when unrecoveredCount is 0` → **PASS**
  - `auditAlbumRhythm treats safe repaired spreads as non-blocking when unrecoveredCount is 0` → **PASS**
- **既存回帰テスト**: [tests/task078-2-2-readiness.test.mjs](tests/task078-2-2-readiness.test.mjs)
  - 13件全件 **PASS**
- **全リポジトリテスト**: `node --test tests/*.test.mjs`
  - **1,088件全件パス (0 fail)**
- **TypeScript 型チェック**: `npx tsc --noEmit`
  - **エラー 0 件**
- **ESLint**: `npm run lint`
  - **エラー 0 件**
- **差分空白チェック**: `git diff --check`
  - **エラー 0 件**
