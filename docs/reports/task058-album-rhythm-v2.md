# Task058 Album Rhythm v2 + Quiet / Title / Event Pages

実施日: 2026-10-02
実装判定: **コード・自動検証PASS / 実写真Benchmark未認証**

## 実装

- `generation_metadata.composition`に`album-rhythm-v2` planを保存。COVERとspreadごとのTITLE / INTRO / HERO / STORY / GRID / QUIET / CLOSING role、LOW / MEDIUM / HIGH density、順序を保持する。既存DB spreadやDB schemaは変更していない。
- Title pageはalbum title、pet name、対象期間の情報だけを中央配置する。複数ペットdraftや必須値不足ではtitle pageを追加しない。
- birthdayはpetsのbirth dateからアルバム期間内の最新の誕生日を導出し、adoptionは保存済みdateが対象期間内にある場合だけ表示する。欠損・不正・期間外のdateからeventを作らない。
- Quiet roleは3 spread以上のalbumで、単写真またはlayout metadataがquiet/editorialの候補から割り当てる。Closingは条件が合う最終spreadのroleとして任意で付け、写真なしのDB spreadを作らない。
- Hero、family、same layout、denseの連続をsoft penaltyで抑える。候補sortは引き続きSTRICT > FALLBACK > UNUSABLEで、tier crossingなし。Best Shotが十分優位な場合は反復回避で上書きしない。
- Density rhythmはstory densityとlayout densityを記録し、dense streakに段階的penaltyを加える。
- Existing grammarの3-photo Hero+2 / horizontal stack、4-photo 2x2 / Hero+3 / Editorialを確認。十分な既存候補があるためtemplateは追加していない。
- ViewerとPrint Previewは同一composition planを順序どおり表示。Print PDFもTITLE/EVENTを独立ページとして出力し、planはfingerprintに含まれる。
- Print gateを強化。caption/photo、text/photo、text/decoration、decoration/photo、safe area、gutter、8pt未満、Title/Event文字overflow、font missingをblockingにし、不安全なPDFを生成しない。Trim/BleedはPrintSpecの値を維持する。

## Human Review

しまうまプリント実物写真と、実データに基づく認証済みalbum sessionを確認できなかった。したがって、以下はすべて **NEEDS_TUNING** とし、`BENCHMARK PASSED`とは判定しない。

- A. Hero clarity: NEEDS_TUNING
- B. Crop quality: NEEDS_TUNING
- C. Layout variety: NEEDS_TUNING
- D. Whitespace: NEEDS_TUNING
- E. Page rhythm: NEEDS_TUNING
- F. Story coherence: NEEDS_TUNING
- G. Print readability: NEEDS_TUNING
- H. Photo prominence: NEEDS_TUNING
- I. Event/text page: NEEDS_TUNING
- J. Emotional quality: NEEDS_TUNING

新しい実PDFで確認したFAILは0件。ただし実物/実写真レビュー自体が未実施のため、Benchmark gateのPASS条件は満たしていない。synthetic testでcollision、safe-area、min-font、Title overflowをblockingすること、およびPDF page sizeを検証した。

## Real-photo / Browser Review

- 認証済みrouteは未確認。localhostは`/`から`/login`へ307、`/login`は200。Viewer → Print Preview → PDFの実アカウント導線は未完了。
- 1/3/4/5 photoのreal-photo目視、およびTitle/Event/Quiet pageのreal-photo目視は未実施。既存synthetic fixtureは1/3/4/5 photo structural coverageを持つが、実写真のcrop/print reviewとは扱わない。
- 実ブラウザからのPDF exportは未実施。既存PDFと新renderer testsでは154 × 216 mm、Trim 148 × 210 mm、Bleed 3 mmを維持。
- しまうま実物素材がないため、テンプレートのコピーは行っていない。

## Verification

- `node --experimental-strip-types --test tests/*.test.mjs`: PASS（793 / 793）
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS
- 変更範囲`npx eslint`: PASS
- `git diff --check`: PASS
- DB migration: 追加なし
- commit / push: 未実施

## Remaining

- しまうまプリント実物と認証済みsessionで、1/3/4/5 photo、Hero/crop/page rhythm、Title/Event/Quiet、Print Previewからの実PDFをHuman Reviewする。
- `album_photos`のGET取得件数には既存の`.limit()`上限がない。大規模albumの実データ/network計測後に必要性を判断する。
- Browser reviewで実際の写真順・caption・event placementが自然かを確かめ、必要ならsequence role基準を調整する。

DB migration、commit、pushは実施していない。
