# Task067 — Annual Memory / Year in Review

## Annual model

- 年間periodはAsia/Tokyo基準の `YYYY-01-01 00:00` 以上、翌年 `01-01 00:00` 未満。
- 年キー、Candidate version、年間専用fingerprint、決定的album IDを月次Candidateと分離した。
- Passive Annual Candidateは行を作らず、ユーザーが初めて開いた時だけ年間専用RPCで正式Draftへmaterializeする。
- 現時点の正式対象はsingle-pet。multi-pet annualはpet balance、cover、Story混在仕様が確定していないため暗黙対応していない。

## Eligibility

> Task067.1でgraceful degradationを追加した。以下の当初仕様の「全写真解析済み」条件は、現在は解析数・解析率・月カバレッジ・選定数の安全閾値へ置き換えられている。詳細は `task067-1-annual-eligibility-graceful-degradation.md` を参照。

- 最低写真数はconfig化し、初期値を48枚とした。
- 対象年の保存済み解析を利用する（Task067.1で部分解析を安全に許容）。
- 年間アルバムがすでにmaterialize済みの場合は新Candidateを作らない。
- 年間選定が写真の存在する各月を代表できない場合もReadyにしない。
- 閾値や解析条件を満たさない年を完成表示しない。

## Photo selection

- 既存Album Candidate、Best Shot、Story、Smart Crop、Smart Layout、Album Rhythm v2を年間periodで再利用する。
- `storedOnly: true` により新規Vision callを禁止し、保存済み解析だけで候補を作る。
- 年間全写真をそのまま採用せず、既存の重複抑制・同日偏り抑制・Story diversityを経た最大36枚を使用する。
- Hero assignmentを年間Best Shot／cover候補として使用する。
- 選定後に各写真月の代表が含まれることを検証する。
- accepted/orderedな月次アルバムIDを年間metadataへ記録し、既存月次成果物を再利用元として追跡可能にした。月次行・layoutは更新もcopyも行わない。

## Season structure

- Winter: 12・1・2月
- Spring: 3・4・5月
- Summer: 6・7・8月
- Autumn: 9・10・11月
- calendar year内だけを対象にし、写真がないseasonは構成metadataから省略する。
- 各seasonには選定photo IDsと対応Story spread IDsを保持する。

## Composition

- 既存Album Rhythm v2のCOVER、TITLE、INTRO、HERO、STORY、GRID、QUIET、CLOSING構造を利用する。
- season groupingを別metadataとして保持し、月次layoutをそのまま複製しない。
- 保存済みの誕生日とお迎え日だけをEVENT候補に使用し、日付を推測しない。
- 空seasonを無理に生成しない。

## Monthly reuse / protection

- 年間Candidateの照会は月次albumを読み取り材料にするだけで、月次album、Draft、cover、spread、print snapshotを更新しない。
- accepted、ordered、finalizedな月次アルバムは年間materializationの妨げにも更新対象にもならない。
- 年間専用RPCは同じpet/yearのAnnual Draftだけを重複・保護判定し、月次Draftを区別する。

## NOW / Album list

- NOWでの強調期間はconfig化し、12月15日から翌1月31日までに限定した。
- 記念日Heroは年間候補より優先し、通常月のNOW Heroを年間候補が奪わない。
- 表示文言は「YYYY年の思い出、できています」、CTAは「1年を振り返る」。
- Album listには月次カードと区別した `YYYY · YEAR IN REVIEW` カードを追加し、年間カードを同年の月次一覧より上へ配置する。
- materialize後もactive Draft metadataから年間アルバムを識別し、「年間アルバム」として表示する。

## Print consideration

- 年間Draftも既存のDraft payload、cover、Album Rhythm v2を使用するため既存Print gateへ接続可能。
- metadataへ選定写真数、spread数、推定ページ数、全spreadがusableかを示すprint-safe情報を保存する。
- provider料金計算・注文・課金は実装していない。

## Atomic materialization

- migration: `20261005120000_atomic_passive_annual_materialization.sql`
- `auth.uid()`、pet ownership、JST年間period、決定的album ID、fingerprint、source/selected photo集合、payload整合性をRPC内で再検証する。
- pet/year由来のtransaction advisory lockで二重openを直列化する。
- album、album_photos、Draft、cover、analyticsを1 transactionで作成し、partial stateを残さない。
- 同fingerprintの再openは既存Draftを返す。
- migrationはremote未適用。`supabase db push --dry-run`は成功し、このmigration 1件だけが適用候補として表示された。

## Tests

- 全suite: 912 passed / 0 failed
- Annual / NOW targeted suite: 30 passed / 0 failed
- `npx tsc --noEmit`: passed
- `npm run build`: passed
- scoped ESLint: 0 errors / 2 existing `no-img-element` warnings
- `git diff --check`: passed
- `npx supabase db push --dry-run`: passed（remote変更なし）

検証範囲：JST年境界、写真不足、解析不足、eligible year、season grouping、空season省略、Best Shot再利用、月代表、fingerprint、duplicate防止、月次保護、NOW表示期間、Album list、single-pet scope、Vision callなし、print metadata、atomic RPC。

## Remaining issues

- multi-pet annualは未対応。既存multi-pet albumを壊さないためsingle-pet制約を維持した。
- Annual Candidateはバックグラウンドjobで事前生成せず、年末・年始の認証済みHome/Albumアクセス時に保存済み解析から準備する。
- season区切りはDraft metadataとして保持する。Editorでseason扉を専用表示する高度な年間テンプレートUIは後続範囲。
- 年間候補のReadyには対象年全写真の現行解析を要求するため、安全側だが古い未解析写真が多い年では候補が出ない。
- Node testには既存の`MODULE_TYPELESS_PACKAGE_JSON`警告、buildにはRosetta 2警告がある。

## Git

commit / pushは実施していない。
