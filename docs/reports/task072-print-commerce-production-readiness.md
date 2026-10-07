# Task072 Print Commerce Production Readiness

## 結論

既存実装は、Stripe署名検証、サーバー再計算、配送先スナップショット、注文写真スナップショット、確定済み印刷PDFの不変化、private `print-files`、Webhook再送時の冪等性を備えていた。一方、実印刷会社の仕様・商品マッピング・本番価格・色管理要件は未確定であり、現時点では本番発注を許可できない。

Task072では既存の注文経路を置換せず、決済と製造の状態分離、発注モード、外部リクエスト識別子、再試行判断情報、未確認仕様のRelease Gateを追加した。実課金・実発注は行っていない。

## Existing architecture

- Print Previewはactive draftからimmutableな`album_print_snapshots`を生成し、PDF pathとSHA系content hashを結び付ける。
- `finalized_at`後はsnapshot、fingerprint、draft version、PDF path、hashをDB triggerで変更できない。
- orderは`draft_version_id`、`print_snapshot_id`、`print_fingerprint`を保持し、確定snapshotとの一致をDB triggerで検証する。
- Stripe Checkoutは認証、album/pet所有権、商品、ページ、配送先、写真数をサーバーで再検証し、価格をサーバー計算する。
- Stripe Webhookは署名とstored session/album/snapshot bindingを検証し、`mark_order_paid` RPCでpaid化、注文写真固定、album ordered化、print job作成を一transactionで行う。
- `print-files`はprivate/PDF onlyで、authenticated向けpolicyを持たず、生成workerのみが扱う。
- PDF preparationはlease付きclaimとstale worker guardを持つ。

## Snapshot model

`album_print_snapshots.snapshot`にdraft由来のcover、spreads、layout、crop、revision、geometry、generatedAtを保持し、行にはdraft version、schema version、fingerprint、PDF path、content hash、finalized timestampを保持する。order linkageは`orders.print_snapshot_id`で固定される。paid後のEditor変更は既存注文へ反映されない。

## Product / provider model

- A5 portrait candidate geometryはtrim 148×210mm、bleed 3mm、PDF 154×216mm、safe inset 3mmのまま維持した。
- provider、binding、paper、ICC、PDF/Xは未確認として`null`、production readyは`false`とした。
- 現rendererはRGB PDFであり、CMYK対応済みとは表明しない。
- Provider interfaceに`validateOrder`、`createOrder`、`getOrderStatus`、`cancelOrder`、`normalizeError`境界を追加した。
- `PRINT_COMMERCE_MODE`は`disabled | test | live`。defaultは`disabled`。
- provider、SKU、製本、色、PDF規格、本番価格が未確認の間はLIVEでもRelease Gateが外部発注を拒否する。
- Checkout route自体は維持するが、TESTはStripe test keyのみ、LIVEは全Release Gate解消後だけSessionを作成する。現状の実課金は停止する。
- Prodigi adapterは引き続きskeletonで、endpointやSKUを推測せず外部通信しない。

## Order states and idempotency

- Paymentは既存`orders.status`で管理する。
- Fulfillmentは`print_jobs.fulfillment_status`へ分離する。
- provider request IDはunique、既存idempotency keyもunique。
- `mark_order_paid`のorder row lockとunique idempotency keyによりduplicate webhookは二重jobを作らない。
- create order timeoutは`unknown`を記録でき、blind retryせずoperator確認へ回せる列を追加した。
- PDF準備失敗は既存safe error codeのみを保存する。

## Pricing / address

- 商品・ページ・送料はサーバー側catalogから再計算し、client値を信用しない。
- quantity、tax、currencyを明示し、provider costはcustomer selling priceと分離したnullable列とした。
- 既存catalog価格は開発用であり、本番価格確定済みとは扱わない。
- 配送先はorder snapshotとして保持し、Stripe metadata/URL/logへ住所・氏名・電話を入れない。

## PDF validation

既存検証はpage size、TrimBox、BleedBox、safe area、gutter、画像欠落/破損、DPI、font、text overflow、page structure、checksumを扱う。CMYK/ICC/PDF-X、製本別gutter、provider固有cover寸法は未確認でRelease Gate。provider仕様確認前の変換は追加していない。

## Security

- Checkoutはuser clientでowner境界を確認後、admin clientは注文作成に限定。
- WebhookはStripe署名成功後だけservice roleを利用。
- Fulfillment tableはRLS有効かつauthenticated/anon権限なし。
- print provider credentials、service role、住所、signed URLはclientへ渡さない。
- FREE/PLUS entitlementはPrint Preview/Checkout/Orderを購読条件にしていない。

## Migration

`20261007150000_print_commerce_readiness.sql`を追加しremoteへ適用済み。ordersへquantity/tax/currency/provider_cost、print_jobsへmode/fulfillment lifecycle/provider request/error/retry/timestampを追加した。既存orders/print_jobs/snapshotを再利用し、重複tableは作成していない。local/remote migrationは一致し、dry-runはpending 0。Database型もremote schemaから再生成済み。

## Verification

- full suite: 952 tests pass / 0 fail
- TypeScript: pass
- scoped ESLint: pass
- Next.js production build: pass
- git diff --check: pass
- remote migration list: local/remote一致
- post-apply dry-run: pending 0
- 実Stripe課金・実provider call: 0
- remote schema columns: type generation成功により確認

## Release Gates / remaining issues

以下が確認されるまでproduction provider submissionは禁止。

- 正式providerとAPI契約
- provider SKU/product mapping
- binding/paper/gutter/cover仕様
- CMYK/ICC/PDF-X要件
- provider shipping/address validation仕様
- 本番販売価格、税、送料
- provider webhook/polling/cancel semantics
- createOrder timeout後のprovider照会手段

専用admin UIは未実装だが、order ID、payment、fulfillment、provider order ID、safe error code、retryable、timestampsをDBで追跡可能。

## Safety statement

実Stripe課金、実provider注文、provider API callは実施していない。commit/pushも実施していない。
