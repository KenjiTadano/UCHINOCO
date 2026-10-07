# Task062 — Photo Intake & Auto Album Loop

## 1. Existing Intake Audit

### A. Upload時に実行

- BrowserでJPEG/PNG/WebP/HEIC/HEIFを検証し、HEICは既存のbrowser内JPEG変換を利用する。
- EXIF撮影日時、SHA-256 `content_hash`、400px WebP thumbnail、previewを生成する。
- original / thumbnail / previewをsigned upload URLでBrowserからprivate Storageへ直接送る。
- ServerでStorage object、path、MIME、size、所有者を再検証し、`photos`を保存する。
- 保存後に`photo_ai_analyses`へ`pending`をidempotentに登録する。

### B. 後から実行

- 認証済みapp shellのrunnerが`photo_ai_analyses`を順番にclaimし、既存semantic解析を実行する。
- Task062では、その後にTask051 Photo Intelligence / Smart Cropの不足分を既存version + source fingerprintで探索し、段階的に実行する。
- 完了後はHome、ペット詳細、Albumをrevalidateし、保存済みscoreから今日のBest Shotを再評価する。

### C. 手動起動

- 写真詳細のAI解析ボタン、各dev lab、ユーザー操作によるAlbum Draft生成は維持する。

### D. 未接続だった箇所

- Task051 Photo Intelligence / Smart Cropはdev actionとして存在したが、通常upload queueから未接続だった。
- Story / Best Shot / Album Candidateは派生計算であり、写真追加後に永続albumを自動作成・更新する仕組みはなかった。

### E. 重複実行リスク

- uploadの二重実行はcontent hash、unique constraint、Storage pathで防止済み。
- semantic解析はstatus/attempt/updated_atのclaim fenceで防止済み。
- Photo Intelligence / Smart Cropはphoto ID、analysis version、source fingerprint、既存terminal resultで重複呼び出しを防ぐ。

## 2. Intake State

新しいDB列は追加せず、`photos`、media path、`photo_ai_analyses.status`、`photo_analysis_results`、candidate thresholdから次のderived stateを定義した。

- `UPLOADED`
- `MEDIA_READY`
- `ANALYSIS_PENDING`
- `ANALYZED`
- `ALBUM_ELIGIBLE`
- `FAILED_ANALYSIS`

## 3. Upload Fast Path

AI解析は`finalizePhotoUploads`の成功条件に含めない。写真とmedia derivativeを保存した時点で画面遷移し、一覧へ即時表示する。表示メッセージは「AIが思い出を整理しています。完了を待たずに写真を見ることができます。」とし、providerやqueueの失敗で写真保存をrollbackしない。

## 4. Media Derivatives

Task052.1のoriginal / thumbnail / preview構成を維持した。一覧はthumbnail、viewer/editorはpreview優先、printはoriginal、legacy fallbackも変更していない。画像binaryはServer Actionを経由しない。

## 5. Analysis Deduplication

既存semantic queueはunique photo rowとclaim fenceを継続利用する。Photo Intelligenceは直近の所有写真から、現在の`PHOTO_INTELLIGENCE_VERSION`と`sourceFingerprint(storage_path + content_hash + updated_at)`に一致する`photo_analysis_results`を除外する。successだけでなくfallback/failedも「試行済み」として扱い、provider failureによる無限再実行を防ぐ。Task051内部でもmemory → DB → AIの順に再利用する。

## 6. Failure Isolation

`photos` INSERTが成功した後にqueue登録を試す。queue登録やAI処理が失敗しても、original/thumbnail/previewと写真rowは残る。APIは安全なdegraded responseで停止し、次回のauthenticated visitではanti-joinによる未登録写真発見も利用できる。

## 7. Best Shot Refresh

新規Photo Intelligence resultには、検証済みsemantic payloadに加えてdeterministicな`overallScore`を保存する。Homeは追加Vision callを行わず、当日の保存済みscoreだけでBest Shotを再選定する。解析完了時に`/home`をrevalidateする。

## 8. Story Refresh

Story groupingは永続albumを書き換えず、既存のderived/on-demand処理を維持する。写真batch保存後にペット詳細・`/memories`・Albumを一度revalidateし、次に開いた対象期間だけが新しい写真を含めて再計算される。album全体の無条件再生成は行わない。

## 9. Album Candidate Refresh

現在月の`timeline_at`件数をbatchの前後で各1回だけcountし、`ALBUM_CANDIDATES_CONFIG.budget.minPhotos`のthreshold crossingを判定する。threshold未満では残り枚数、到達後は「AIが今月のアルバムをまとめられます」をUCHINOCO NOWに表示する。到達してもalbum/draftは自動作成しない。

## 10. Draft Protection

intake処理は`albums`、`album_photos`、`album_draft_versions`、print snapshotをINSERT/UPDATEしない。editing中のuser override、accepted/ready album、ordered album、finalized print snapshotは不変。新写真の自動mergeは行わず、将来の「新しい写真を追加しますか？」導線に委ねる。

## 11. UCHINOCO NOW

- 解析完了後、保存済みscoreで「今日のベストショット」を更新する。
- 今日追加された写真は従来どおり即時候補になる。
- threshold直前は「あとN枚」、到達後はCandidate Readyとしてレビュー導線を表示する。
- 新Hero typeは増やさず、既存`ALBUM_PROGRESS`をready状態にも対応させた。

## 12. Batch Upload

最大10枚の既存batch uploadを維持する。Storage uploadは並列、DB保存とqueue登録は所有権検証付きで行う。candidate countとrevalidationはbatch単位で行い、写真ごとにCandidateを再計算しない。

## 13. Idempotency

- clientのpending状態でdouble submitを防ぐ。
- `content_hash`とDB unique constraintで同一写真を防ぐ。
- semantic claimはstatus/attempts/updated_atを条件にする。
- Photo Intelligenceはversion/fingerprint resultを再利用する。
- runnerの共有`activeRequest`によりroute変更やStrict Modeで重複batchを開始しない。

## 14. API Cost

runnerはsemanticとPhoto Intelligenceを交互に処理する。1処理窓は最大4 work item、次の窓まで5分とし、無制限Vision loopを防ぐ。Task051は保存済みanalysisを優先し、同じversion/fingerprintを再送信しない。unsupported/terminal imageと最大試行到達は既存policyで除外する。

## 15. Multi-pet

upload、queue、Photo Intelligenceのすべてで`auth.getUser()`、`photos.uploader_user_id`、`pets.owner_user_id`を明示的に確認し、RLSも維持する。写真は指定petへ紐づき、既存multi-pet album生成処理は変更していない。

## 16. Browser Verification

ローカルbrowserは未認証状態で`/login`へredirectされており、実写真を使うScenario A/B/CとNetwork call数の目視確認は未実施。認証済み環境で、即時一覧表示、整理中表示、candidate progress、edited draft不変を確認する必要がある。

## 17. Human Review

判定: **ACCEPTABLE**

- 写真保存はAI待ちから分離され、「写真を入れるだけ」の主要体験を維持できている。
- 整理中表示は短く、写真閲覧を妨げない。
- candidate readyは自動生成ではなくレビュー導線で、勝手に編集結果を変更しない。
- 完了toastや「新しい写真がN枚」のedited draft通知は将来拡張であり、現状はrevalidationと候補表示まで。

## 18. Tests

`tests/photo-intake.test.mjs`にderived state、single/batch upload、media derivatives、duplicate、failure isolation、version/fingerprint reuse、段階処理、retry fence、candidate crossing、Draft/ordered protection、NOW readyを追加した。全suiteは831件成功。

## 19. TypeScript

`npx tsc --noEmit` 成功。

## 20. Build

Next.js 16.3.5 / webpackの`npm run build`成功。既存のRosetta 2 warningのみ。

## 21. Lint

Task062変更範囲のESLint成功。`git diff --check`成功。

## 22. Known Issues

- durableなbatch/job tableは追加していないため、batch横断の詳細進捗は開発ログのみ。
- work windowは4項目/5分であり、大量batchの完全解析には複数windowまたは次回訪問が必要。
- Story / Candidateは派生/on-demandで、background materializationは行わない。
- 旧Photo Intelligence resultには`overallScore`がない場合があり、新規解析分からHome Best Shotへ反映される。
- 認証済みbrowser E2EとNetwork call countは未確認。

## 23. commit / push

commit / pushは実施していない。既存の未commit差分を維持した。
