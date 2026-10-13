# Task082.2 — Cover Edit Persistence & Navigation Synchronization

更新日: 2026-10-13（JST）

## 背景と受入状況

Task082.1の正しいPreviewで、album `38768139-f147-4904-9174-0516bbef4793` の表紙写真を変更し、`/edit`一覧へ戻ると表紙サムネイルへ反映されないとのユーザー報告があった。詳細は `task082-preview-thumbnail-state-sync.md` に記録済み。

Task082.1全体はまだ受入PASSにしない。今回の変更は表紙Editorと表紙mutationに限定した。既存のTask082報告書差分は保持している。

## 変更前のactual save path

`setPhoto` → `applyCoverPhoto`でlocal coverを即時更新 → save queue → `overrideCover` → `apply_draft_cover_override` RPC → cover row再取得 → local merge → 通常Linkでroute遷移。

コード変更前に、この経路、saving/saved/error、revision/clientSeq、active version、navigation、cacheを確認した。

- 表紙mutationは本文の `finishWrite` を通らず、成功後のroute revalidationがなかった。
- 戻る／完了のLinkはqueueやRPCを待たなかった。
- Promise rejectionのcatchがなく、finallyでsavingからsavedとなる経路があった。
- revisionをqueue登録時に捕捉しており、先行write完了後も後続writeが古いrevisionを使い得た。
- 古い応答を表示へ採用しない場合、DB revisionまで更新されない問題があった。
- 単一debounce timerで別fieldへ編集を移すと、前のfieldの未送信保存を消す可能性があった。

これらはコード上で確認した保存契約の不足である。元のPreview事象が保存raceとcacheのどちらで起きたか、表紙の実DB保存結果は元ログから確定できていない。

## 表紙限定の修正

### Queue / optimistic state

即時表示は既存のcover resolverと `applyCoverPhoto` 等を維持する。queueのFIFOも維持し、大規模な共通hook再設計は行わない。

queued件数、in-flight件数、debounce pendingを追跡する。queue登録直後からsavingとなり、未送信や待機中のwriteがある間にsavedへ戻さない。別debounce fieldへの変更では前のfieldを送信してから次を登録する。

各writeは実行時の `revisionRef.current` を使用する。先行writeのDB revisionは、表示へ応答を採用しない場合も単調に更新する。

### Navigation race

表紙Editorの戻る／完了は `flushPending` でdebounceを送信し、queueをawaitしてからrouteへ移動する。新たなpending操作や保存失敗が残れば移動しない。reload/close時の未保存警告も追加した。

ブラウザ固有の戻る操作やtab終了時の通信完了は今回のローカルテストだけでは保証しない。標準の戻る／完了Linkは実componentのhandlerをテストしている。

### Error / retry

rejection、`ok:false`、conflict、stale、missingは明示errorとして扱う。local編集は保持する。失敗/intentsをfieldごとに保持し、別fieldの成功で失敗情報を消さない。失敗fieldを再試行できる。

### Stale response / active version

新しいclientSeqのlocal編集を古い応答で巻き戻さない。cover IDまたはdraft versionが異なる応答は採用しない。active version/cover IDが変わった場合、表紙画面のkeyで初期化する。

`overrideCover` はRPC前後に対象draftのis_activeを確認し、同じversionのcover rowだけを再取得する。inactiveまたは途中でversionが変わった場合はconflictとして返し、別versionのcoverをUIへ渡さない。

DB RPC自体やmigrationは変更していない。active version切替とRPCを新しい単一DB transactionへまとめたものではない。途中切替は再確認で検出し、成功応答として採用しない。

### Route revalidation

cover mutationが `applied` の場合に限り、対象albumの以下を `revalidatePath` で再検証する。

- album detailのbase route
- `/edit`
- `/print`

Previewはdetailの `?view=preview` なのでbase routeの再検証で含まれる。queryごとの独自cacheやtimestamp queryは追加しない。本文のrevalidation処理には変更を加えていない。

一覧とPreviewの表示は、既存Task082.1の同じactive draft cover resolverを使う。今回それらのrendererや本文state treeを変更していない。

## Tests

追加: `tests/task082-2-cover-persistence-navigation-sync.test.mjs`（10件）。既存shared historyテストは表紙の保存呼び出しassertionだけを実行時revisionの契約へ更新した。

1. local photo optimistic updateの即時反映とsaving状態
2. 実mutation関数のRPC呼び出し、更新row再取得、detail/Preview/edit/print再検証、Preview reload相当の表示
3. RPC前のinactive拒否、RPC中のactive version切替検出と応答不採用
4. conflict/RPC errorで成功としてroute再検証しない
5. Aの遅い応答でBのlocal photoを戻さず、queued Bが最新revisionを使う。直接mergeでも古い応答・別versionを拒否
6. rejection/ok:false/conflictでerror・local編集を保持、navigation停止、retry成功
7. title/subtitleの連続debounceを両方保存
8. 実「完了」Linkがqueued save成功後だけ遷移
9. 実「戻る」Linkがrejection時に停止し、エラーとretryを表示
10. 保存後の実 `/edit` server pageが同じactive coverの新写真を表示

実hook、mutation、component/handler、SSR rendererを実行した。React hook storage、service通信、Supabase query/RPCはテスト側で制御している。実DBでの永続化やブラウザroute cache挙動のE2E確認とは区別する。FIFOにより同時RPCは発行せず、「Bのlocal編集後にA応答」の保護と、直接mergeでの旧応答保護を検証した。

## Verification

同梱Node 24.19.0で実行。

- `node --test tests/*.test.mjs`: 1,123 pass / 0 fail
- `npx tsc --noEmit`: pass
- `npm run lint`: 0 errors / 12既存warnings
- `npm run build`: Next.js 16.4.0 webpack build成功
- `git diff --check`: pass

本文Editor、Task082.1本文renderer、Task081 subset、Album generation、Safety、Task078 Recovery/No-Crop Registryの実装差分がないことも確認した。全回帰テストには24/48/72P・Multi-Pet関連テストを含む。

## Preview acceptance result / Definition of Done

Task082.2はローカル検証PASS。commit/push/deployは未実施で、Preview Acceptance前で停止する。

実環境のDB保存・reload・一覧/Previewへの反映はまだ未受入であり、Definition of Doneを全件達成とは扱わない。Task082.1全体も引き続き受入未完了。

次のPreviewでは、表紙Editor → 写真変更 → 保存済み確認 → 戻る → 一覧サムネイル → Preview → reload → 一覧/Previewの写真維持、の順で確認する。保存失敗の明示errorと再試行、本文編集とNo-Cropの回帰も確認する。

main merge/push、Production deploy、reset/stash/cleanは実行していない。
