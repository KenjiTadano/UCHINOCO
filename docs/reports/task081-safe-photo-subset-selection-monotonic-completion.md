# Task081 / Task081.1 — Safe Photo Subset Selection Hardening

更新日: 2026-10-13（JST）

## 背景

Task080の実写真検証では、23枚解析済みで24Pが完成した後、24枚解析済みでは未回復見開きが1つ残った。Task081は、全候補を強制使用せず、安全な写真集合で完成するための追加選定である。Task081.1では共有状態、前回安全構成の保存、自動選定テスト、diagnosticsのギャップを修正した。

## Request isolation

`lib/album-draft/editorial.ts` の `failedReplacementVariants` をmodule-levelから `buildEditorialDraft` 内へ移した。No-Crop候補として参照する際も同じstory IDに限定する。global resetや共有キャッシュは使用しない。失敗replacementを生成したAの途中でBを再入実行し、BのNo-Crop候補数・拒否理由が単独実行と一致することをテストした。A→B→A→Bも検証する。

Task078のtemplate fallback、safe fallback、replacement、adjacent reflow、photo drop、safe sparse、No-Crop Final Layoutを維持した。crop、source clipping、hero hierarchy、gutter、subject visibilityの閾値は変更していない。同期Visionは追加していない。

## Previous safe subset strategy

既存情報を調べた結果、generation intentは重複実行防止と完了アルバムへの遷移に利用されており、別intentの前回安全構成を提供しない。stored generation inputsは解析情報を提供するが、成功した構成自体は持たない。`album_photos` は選択IDを持ち、`album_draft_versions.generation_metadata` は既存のJSON保存領域である。

新しいDB tableは作らず、成功draftの既存 `generation_metadata.safe_subset` に次を保存する。

- 元のeligible集合のIDと入力fingerprint（baseTokens）、集合の件数
- 選択された写真と、その時点のBest Shot/group/scene等の評価context
- Recovery後の実際のstory構成、role、layout ID
- settingsとengine/config/template registryに基づくscope、snapshot version

元入力fingerprintにはsource情報・保存解析由来のintelligence/sharpness・geometryを使用する。追加写真で変化し得るgroup、rank、relative uniqueness等は基礎集合のidentityに含めず、前回の評価contextとして保存する。これにより、追加後のrerankingだけで前回構成を無効化しない。写真・解析・caption等が変更された場合は再利用対象から外れる。

前回検索は認証済みowner、同じscope、N件、N+1のtoken集合へのJSONB包含で絞り、最新1件のみ取得する。Supabase clientのarray引数はSQL arrayとしてシリアライズされるため、JSONB包含には `JSON.stringify(tokens)` を渡す。mock fetchで実際のPostgREST URLとowner/設定条件/limitを確認した。

再利用時は保存された選択context・stories・layoutを使用する。layoutを候補として指定しても、既存の `buildSpreadDraft` / `evaluateSpreadLayoutCandidates` を通し、安全性を再評価する。前回成功を理由にunsafeをPASSにしない。

## Monotonic guarantee scope

保証対象は、この実装で安全なdraftが保存された後、同一owner、Pet集合、page count、解決済み対象期間、label、同一engine/config/template、および未変更のeligible base photo setに対し、eligible写真がちょうど1枚増えた場合である。

N+1の通常Recoveryが失敗しても、前回安全構成の試行枠を最大4回の探索内に確保する。新しい候補の再計画が成功すればそれを採用し、失敗した場合は保存されたN枚時点の構成を再評価する。単なるrerankingをprevious safe fallbackとは呼ばない。

この保証は前回安全構成への探索経路を保持する保証であり、外部サービス障害や80秒budget不足を含むあらゆるリクエストの完了保証ではない。DB取得エラーやbudget不足ではretryableに戻す。安全条件が変われば再利用は拒否する。

## Bounded searchとsingle-photo behavior

サブセット探索は引き続き `MAX_SUBSET_SEARCH_ATTEMPTS = 4`。

- 有効なprevious snapshotがある場合: 最大3件の通常候補 + 前回構成1件
- previous snapshotがない場合: 最大4件の通常候補
- 各試行前に既存80秒budgetを確認
- previous lookupは1件。全組み合わせ探索は行わない

除外候補は未回復storyへの寄与、source clipping/crop suitability/品質のスコア、relative uniqueness、photo IDで決定的に順序付ける。新しい写真の追加順を除外条件にはしない。

single-photoの未回復storyも選定候補を返す。写真を除外してアルバム全体を再計画するため、別の選択写真やunused poolを用いた構成へ戻れる。最少枚数と既存Safety評価は維持する。見開き内replacement/No-CropはTask078に任せ、同じ処理を再実装しない。

## Diagnostics

サブセット処理が開始された場合、成功・候補枯渇・budget終了・非layoutエラーでdiagnosticsを出力する。非layoutエラーを無条件に握り潰して探索を続けない。

`eligiblePhotoCount`、`selectedPhotoCount`、`unusedPhotoCount`、`subsetAttemptCount`、`subsetSuccessCount`、`initialUnrecoveredCount`、`finalUnrecoveredCount`、`subsetCandidateCount`、`subsetDurationMs` を出力する。`fallbackToPreviousSafeSubsetCount` は保存構成を実際に採用した時だけ1になる。

未実装だった原因別drop countと `spreadSubsetAdjustments` は削除した。写真ID、snapshot、token、caption、URL等をdiagnosticsへ出さない。通常Recovery成功時にこのイベントが出ないのは正常である。

## Regression tests

`tests/task081-safe-photo-subset-selection.test.mjs` はサーバーactionが使用する同じ `searchSafePhotoSubset` と実際のplanner/Recovery/Safety evaluatorを使用する。除外IDをテストから指定しない。

- Case A: 23枚で安全に完成 → source clippingのある24枚目追加 → 全24候補の通常plan/Recoveryが実際に未回復エラー → 自動選定で安全に完成。単一写真の未回復storyを含む。
- Case B: 23候補の既存低適性写真を自動選定でunusedにして安全に完成 → 品質が高く安全な24枚目を追加 → 自動選定が新写真を採用し、既存低適性写真をunusedにする。23候補時点はサブセット選定も含む生成経路での成功である。
- 同一24入力を繰り返し/Promise.allで実行し、選択ID・件数、unused件数、試行回数、story構成、unrecoveredCountが一致する。
- 通常候補の失敗を注入するテストで、4回以内にprevious safe構成へ戻る専用枠を検証する。これは保存構成のfallback制御テストであり、実写真の24P受入結果ではない。
- group/score再計算後も前回contextからstory・選択ID・layoutを再現する。
- source geometry/settings/追加枚数が異なる場合のsnapshot拒否、budget停止、diagnostics、owner/JSONB検索条件、A/B request isolationを検証する。

Next.js Server Action自体の認証・DB保存・UI遷移を含むend-to-end実行は今回行っていない。これらはPreview Acceptanceで確認する。

## Verification

標準PATHのNode 22.5.1では既存 `.ts` importsを直接実行できなかったため、同梱Node 24.19.0をPATH先頭に指定して検証した。package.jsonや依存バージョンは変更していない。

- `node --test tests/task081-safe-photo-subset-selection.test.mjs`: 12 pass / 0 fail
- `node --test tests/task078-2-editorial.test.mjs`: 43 pass / 0 fail
- `node --test tests/*.test.mjs`: 1,101 pass / 0 fail
- `npx tsc --noEmit`: pass
- `npm run lint`: 0 errors / 12既存warnings
- `npm run build`: Next.js 16.4.0 webpack build成功
- `git diff --check`: pass

ローカルCase Aのsubset処理は候補2件、実行1回、約8.94ms（1回の計測）。写真解析・DB・署名URL取得を含むProduction処理の所要時間ではない。時間は診断値であり、結果の決定論性比較からは除外する。

## Remaining limitations / 次の受入

旧draftにはこのsnapshotがないため、一般の安全集合探索では最大4候補で見つからない場合がある。基礎集合が変わる、多数の写真が同時に追加される、engineが変わる場合もprevious preservationの保証対象外である。snapshotは同じresolved period等で照合するので、期間境界が変わる新規リクエストは別scopeになる。

実際のSupabase JSONB検索、同じ実写真24枚/24P、Preview遷移、Vercel diagnosticsはPreview Acceptanceで検証する。今回はPreview/Production deployment、Git commit/push/merge、変更破棄を実行していない。引き継ぎ対象17ファイルを保持している。
