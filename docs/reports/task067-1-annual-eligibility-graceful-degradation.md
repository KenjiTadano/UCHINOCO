# Task067.1 — Annual Eligibility Graceful Degradation

## 変更概要

Task067の「対象年の全写真が現行Photo IntelligenceおよびSubject Geometry解析済み」という条件を、安全な複合閾値へ変更した。未解析写真は選定対象に含めず、解析済み写真だけで十分な量・比率・月代表性・最終選定数を満たす場合にYear in ReviewをReadyにする。

## Eligibility thresholds

`ANNUAL_ALBUM_CONFIG`へ以下を定数化した。

- 年間総写真数: 48枚以上
- 解析済み写真数: 36枚以上
- 解析率: 65%以上
- 代表月数: 6か月以上
- 月カバレッジ: 写真が存在する月の65%以上
- 最終選定写真数: 24枚以上

36枚という解析済み下限は、24〜36枚の年間印刷アルバムを構成できる母数を確保しつつ、Task062がまだ処理していない少数写真を許容するために設定した。6か月・65%の月カバレッジにより、1〜2か月しか表現できない候補や季節的に極端な候補をReadyにしない。

## Unanalyzed photo handling

- 現行versionのPhoto IntelligenceとSubject Geometryが両方揃うphoto IDsを取得する。
- 年間Draft生成チェーンへ`allowedPhotoIds`として解析済みIDだけを渡す。
- 未解析写真はGrouping、Best Shot、Story、Smart Crop、Layoutの入力へ入らない。
- Annual CandidateからVisionを呼ばず、`storedOnly: true`を維持する。
- Task062が後から解析すると`analyzedPhotoIds`が増え、selectionおよびfingerprintが自然に更新される。

## Month representation

- 写真が存在する月数を`populatedMonthCount`として計算する。
- 解析済み写真が存在する月と、最終選定に残った月をそれぞれ再検証する。
- 解析済み写真が0枚の月があっても、6か月以上かつ全 populated months の65%以上を表現できれば候補を許可する。
- 空月は分母へ含めない。
- 代表月が5以下、または月カバレッジが65%未満ならCandidateをReadyにしない。

## Fingerprint freshness

年間fingerprintの材料を以下へ変更した。

- year
- pet IDs
- 実際に利用可能なanalyzed photo IDs
- selected photo IDs
- analysis versions
- annual engine version
- rhythm version

後から解析済み写真が増えるとfingerprintが変わる。すでにmaterializeされた年間Draftは既存Annual Draft保護により再生成・上書きされない。

## Generation chain compatibility

次の既存処理へ後方互換な`allowedPhotoIds` optionを追加した。

- Photo Grouping
- Best Shot
- Album Candidates
- Album Story
- Album Draft

option未指定時の月次生成・開発画面・既存アルバム生成動作は従来どおり。

## UI

- Eligibility不足時はCandidateを返さないため、既存の「写真を整理しています」表示を維持する。
- 一部未解析でも安全閾値を満たす場合は通常の年間Candidateとして表示し、不要な警告をユーザーへ出さない。

## Migration

- Task067の`20261005120000_atomic_passive_annual_materialization.sql`は変更していない。
- remoteへ適用していない。
- `npx supabase db push --dry-run`は成功し、Task067 migration 1件のみが適用候補として確認された。

## Verification

- 全suite: 913 passed / 0 failed
- targeted generation suite: 78 passed / 0 failed
- `npx tsc --noEmit`: passed
- `npm run build`: passed
- scoped ESLint: passed（0 errors / 0 warnings）
- `git diff --check`: passed
- `npx supabase db push --dry-run`: passed（remote変更なし）

テスト対象：全解析、1枚未解析、多数未解析、解析率境界、十分・不十分な月カバレッジ、空月除外、後続解析によるfingerprint変更、materialized Annual保護、Vision callなし。

## Remaining issues

- 閾値は安全側の初期値であり、実運用データに基づく品質評価後にconfig調整可能。
- 解析済み写真が36枚未満、または6か月を代表できない年は、総写真数が多くてもTask062の解析進行を待つ。
- remote Migration適用前は年間Candidateの正式Draft materializationは利用できない。

## Git

commit / pushは実施していない。
