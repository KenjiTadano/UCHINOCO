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

## 2. 調査結果

### サーバー側の実行状況
Production ログ（タイムスタンプ `1791857659710`、runId `9830a9f0-4ed0-44c9-9c07-5c5565ca3bd8`）の全41件のログトレースを精査した結果：
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

**結論**: `unrecoveredCount = 0` の実行において、サーバー側の処理（レイアウト、保存、メタデータ、HTTP返却）はすべて正常完了しており、サーバー起因の失敗は発生していなかった。

### 根本原因
原因はレイアウトエンジンではなく、`app/(app)/pets/[petId]/album/new/album-create-form.tsx` における**クライアント側のステート残留と生成中画面の早期アンマウント**：
1. **先行リクエスト失敗時のエラー残留**: 4秒前の先行試行（写真22枚）で失敗した際、React の `recovery` 状態に「この条件ではアルバムを完成できませんでした…」がセットされた。
2. **自動再試行時の未クリア**: 23枚目完了により `beginGeneration` が自動発火したが、`setRecovery(null)` が呼ばれず旧エラー文字列が残存した。
3. **完了時の生成画面即時アンマウント**: `AlbumGeneratingScreen` の描画条件に `state.status === "complete"` が含まれていなかったため、サーバーから完了が返った瞬間に生成画面が外れ、残存していた `recovery` エラーカードが画面上に再描画された。
4. **非同期遷移中の競合**: `router.replace(previewHref)` がバックグラウンドで RSC を取得している間、ユーザーには失敗画面が見え続けたため、キャンセル操作や離脱が発生してプレビュー到達が阻害されていた。

---

## 3. 実装修正

Layout Recovery エンジン自体には一切変更を加えず、`app/(app)/pets/[petId]/album/new/album-create-form.tsx` を改修：
1. **生成開始時のエラー消去**: `beginGeneration`, `requestCreation`, `selectSmallerPages` で明示的に `setRecovery(null)` を実行。
2. **完了ハンドラでのエラー消去**: `handleResult` の `state.status === "complete"` 処理内で `setRecovery(null)` を実行。
3. **プレビュー遷移中の生成画面保護**: 描画判定に `state.status === "complete"` を追加し、プレビュー画面がマウントされるまでの間、エラーカードや入力フォームをフラッシュ表示させず生成中画面を維持。

---

## 4. 検証結果（ローカル）

- **新規単体テスト**: `tests/task080-post-recovery-completion.test.mjs` → **3件全件 PASS**
- **既存回帰テスト**: `tests/task078-2-2-readiness.test.mjs` → **13件全件 PASS**
- **全リポジトリテスト**: `node --test tests/*.test.mjs` → **1,088件全件 PASS (0 fail)**
- **型チェック**: `npx tsc --noEmit` → **エラー 0 件**
- **リント**: `npm run lint` → **エラー 0 件**
- **差分空白チェック**: `git diff --check` → **エラー 0 件**

---

## Production Acceptance

- **commit**: (待機中)
- **deployment**: (待機中)
- **runtime result**: (待機中)
- **recovery metrics**:
  - `spreadCount`: (待機中)
  - `initialUnsafeSpreadCount`: (待機中)
  - `unrecoveredCount`: (待機中)
  - `initialUnsafeBeforeMatching`: (待機中)
  - `initialUnsafeAfterMatching`: (待機中)
  - `optimizedAssignmentCount`: (待機中)
  - `legacyFallbackCount`: (待機中)
- **completion status**:
  - `generationCompleted`: (待機中)
  - `outcome`: (待機中)
  - `status`: (待機中)
  - `previewHref`: (待機中)
  - `HTTP status`: (待機中)
- **Preview result**: (待機中)
- **PASS / FAIL**: (待機中)
