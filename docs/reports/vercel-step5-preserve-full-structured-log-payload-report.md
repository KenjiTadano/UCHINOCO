# Vercel Log Automation — Step 5 Preserve Full Structured Log Payload レポート

> Historical investigation. The executable VM fallback described below was found unsafe
> in the final audit and replaced by commit `7bb3233`. Current parsing uses JSON.parse
> plus a bounded, non-executing legacy data grammar. The historical validation counts
> below do not describe the current suite (parser 17 / repository 1161 tests).

## 1. 現象と根本原因の分析

### 現象

`npm run vercel:album-logs` で対象イベントが抽出された際、`data` フィールドの内容が

```json
{ "event": "albumLayoutRecovery", "timestamp": 0, "level": "info", "data": { "level": "info" } }
```

となり、`spreadCount` や `photoFrameMatching` などの構造化ペイロードが欠落して `{"level":"info"}` のみが出力されていた。

### 根本原因

1. **オブジェクトメタデータキーの残留と三項演算子の優先順位**:
   Vercel CLI から返される JSON レコードの `logs` 配列内の要素は `{ level: "info", message: "albumLayoutRecovery {\n spreadCount: 12, ...\n}" }` の形式をとる。
   旧コードでは `delete payload.message; delete payload.msg; delete payload.event; delete payload.name;` のみを行い、`level`（および `timestamp`）を削除していなかった。
   そのため `Object.keys(payload).length` が常に `>= 1`（`level: "info"` が残る）となり、`Object.keys(payload).length ? payload : parsedMessage` により、パース後のメッセージではなく `{ level: "info" }` が無条件に採用されていた。
2. **Node.js `console.info` によるオブジェクト文字列表現のパース失敗**:
   Next.js サーバーアクション側で `console.info("albumLayoutRecovery", record)` として出力されたログは、標準 JSON 形式（`{"spreadCount": 12}`）ではなく、Node.js の `util.inspect` 形式（キー引用符なし、シングルクォート、インデント、`[Object]` など）で出力される。
   旧コードの `parseMessagePayload` は `JSON.parse` のみを試みていたため、SyntaxError となりメッセージ文字列のパースに失敗していた。

## 2. 対策と実装内容

### [scripts/vercel-album-logs.mjs](scripts/vercel-album-logs.mjs) の修正

1. **旧Node.jsオブジェクトリテラル処理（廃止済み・unsafe）**:
   - `parseMessagePayload` において、`JSON.parse` の試行に加えて、Node.js 組み込みの `runInNewContext`（当時の隔離context + タイムアウト 200ms。セキュリティ境界ではなかった）による JavaScript オブジェクト表現の評価をフォールバックとして導入。
   - `[Object]` などのプレースホルダー表記に対しても参照エラーを起こさないサンドボックス環境を提供。
   - クロスレルム（VM context）のオブジェクトをメインコンテキストのプレーンオブジェクトへ正規化。
2. **ペイロード統合ロジックの適正化**:
   - `payload` から `level`, `timestamp` などのメタデータキーを除去。
   - `parsedMessage` がオブジェクトとして取得できた場合はそれを正として採用（`{ ...payload, ...parsedMessage }`）。
   - 既存の機密情報マスク（`redact`）により、`spreadDiagnostics` 等に含まれうる photoId/petId などの機密値は確実に `[redacted]` にマスキングされる安全性を維持。

### [tests/vercel-album-logs.test.mjs](tests/vercel-album-logs.test.mjs) の拡充

- 実機ログと同じ Node.js console 出力（`albumLayoutRecovery {\n spreadCount: 12,\n ... \n}`）から、`data` が `{ level: "info" }` に潰されずに `spreadCount`, `initialUnsafeSpreadCount`, `photoFrameMatching` を含む完全な構造化オブジェクトとして復元されることを検証するテストケースを追加。
- `parseMessagePayload` の JSON / Node オブジェクトリテラル両対応の単体テストを追加。

## 3. 検証結果

- **単体テスト**: `node --test tests/vercel-album-logs.test.mjs`
  - 6件全件パス（0 failed）。
- **全リポジトリテスト**: `node --test tests/*.test.mjs`
  - 1,085件全件パス（0 failed）。
- **型チェック**: `npx tsc --noEmit`
  - エラー 0 件。
- **リント**: `npm run lint`
  - エラー 0 件。
- **空白チェック**: `git diff --check`
  - エラー 0 件。
- **実環境ログ検証**:
  - `node scripts/vercel-album-logs.mjs --since 7d --limit 100` を実行し、タイムスタンプ `0` のログから、以下のように完全な復旧・マッチングメトリクスが正しく抽出されることを確認:
    ```json
    {
      "spreadCount": 12,
      "initialUnsafeSpreadCount": 6,
      "unrecoveredCount": 0,
      "photoFrameMatching": {
        "frameEvaluatedCount": 446,
        "comparedPairCount": 1022,
        "matchedPairCount": 1022,
        "suitabilityPhotoCount": 446,
        "averageScore": 0.7360822791773077,
        "assignmentCandidateCount": 648,
        "optimizedAssignmentCount": 218,
        "legacyFallbackCount": 0,
        "portraitMatchedCount": 214,
        "landscapeMatchedCount": 98,
        "squareMatchedCount": 104,
        "cropSafePreferredCount": 248,
        "heroPreferredCount": 190,
        "fullBleedPreferredCount": 0,
        "spreadEvaluatedCount": 12,
        "initialUnsafeBeforeMatching": 6,
        "initialUnsafeAfterMatching": 6
      }
    }
    ```
