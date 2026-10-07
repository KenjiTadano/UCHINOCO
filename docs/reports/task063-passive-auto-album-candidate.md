# Task063 — Passive Auto Album Candidate 実装報告

## 概要

Task062のPhoto Intake threshold（現在12枚）を入口として、対象月の写真と保存済み解析からPassive Candidateを準備する仕組みを追加した。Candidate準備中は `albums` / `album_draft_versions` / `album_photos` を作成せず、ユーザーが「アルバムを見る」を実行した時だけ正式Draftへmaterializeする。

DB migration、新規RPC、RLS変更、Storage変更は行っていない。

## Candidate model

Candidateは次を保持する。

- 対象pet ID（Task063ではsingle-pet）
- JST基準の対象月 `period.start` / `period.end`
- 対象写真IDと候補写真ID
- Best Shot（hero role写真）
- Story grouping（spread ID / story type / photo IDs）
- layout recommendation
- crop recommendation
- cover candidate
- Album Rhythm v2 composition
- title
- fingerprint / deterministic album ID

Candidate本体は15分TTLの安全なprocess-local cacheへ置くが、正本は写真・保存済み解析・engine versionから再現できる。cache消失時もDB rowを増やさず再計算できる。

## Trigger

- Task062の `albumCandidateTransition()` が11→12枚のthreshold crossingを検出する。
- upload batch後の既存revalidateによりHome / Album listの対象期間だけが再評価される。
- threshold未満はCandidateなし。
- threshold以上でも、対象写真すべてに現行versionのPhoto IntelligenceとSubject Geometryが保存済みでなければReady表示を出さない。
- Home / Album listでCandidate構成を準備し、初回の以後の同fingerprintはcacheと既存stage cacheを再利用する。

## Fingerprint / freshness

SHA-256 fingerprint材料：

- sorted pet IDs
- JST対象期間
- sorted photo IDs
- Photo Intelligence / grouping / Best Shot / candidate / story / draft / generation versions
- layout engine version
- Album Rhythm v2 version
- Passive Candidate version

写真追加やanalysis/engine version更新でfingerprintが変わるため、以前の候補はstaleになる。旧Candidateを上書きせず新Candidateとして扱う。ユーザーが開いた正式Draftは更新しない。

## Preparation / API cost guard

- `storedOnly: true` をCandidate pipelineへ伝播した。
- 保存済みPhoto Intelligence / Subject Geometryを利用する。
- Candidate準備から新規Vision callを行わない。
- stored-only groupingでは未保存のvisual descriptorのために元画像をdownloadせず、descriptorなしの安全なdegradeを使う。
- 対象期間だけを処理し、analysis lookupは100件単位、写真取得は200件単位に分割した。
- AI Decoration Recommendationは適用しない。
- 全期間、全album、全写真の再解析は行わない。

不足解析はTask062のbounded intake runner（最大4 work items / 5分window）が補い、完了後にCandidate Readyへ進む。

## Materialize on open / idempotency

1. Candidate画面で現在fingerprintを再検証する。
2. Server Actionでauth userとpet ownershipを再検証する。
3. 保存済み解析だけからCandidateを再取得する。
4. fingerprint由来のdeterministic UUIDをalbum IDとして使用する。
5. `albums` / `album_photos` / `album_draft_versions` / coverを作成する。
6. Draft `generation_metadata` にCandidate version、fingerprint、photo IDs、period、`materialized_on_open` を保存する。
7. Viewerへredirectする。

同じCandidateの二重openは同じalbum IDへ収束する。既に同fingerprintのactive Draftがあれば既存Viewerへredirectする。主キー競合でも別albumを増やさない。

## Draft protection

対象期間に以下がある場合、Passive Candidateを表示・再生成しない。

- user edit eventがあるDraft
- accepted eventがあるalbum
- `ready` / `ordered` album
- finalized print snapshot
- active Draft statusが`editing`

Candidate materialize後に写真が増えても既存Draftは変更しない。新fingerprintは別Candidateになり、保護対象があれば抑止される。

## UCHINOCO NOW / Album list

- Home: Ready時にALBUM_READY Heroとして「今月のアルバム、できています」を表示。
- CTA: 「アルバムを見る」。
- Album list: 正式albumとは別に「AIがまとめました · 未確認」のCandidate cardを表示。
- Candidate preview: cover、枚数、title、未確認状態を表示。
- materialize前は正式DraftではないことをUIで説明。

## Multi-pet

Task063のPassive Candidateはsingle-petのみ。Homeの「すべて」状態から暗黙にanchor petを選ばず、Candidateをmaterializeしない。既存のmulti-pet album作成機能は維持した。multi-pet Passive Candidateはanchor/persistenceの正式仕様決定後の課題。

## 主な変更ファイル

- `lib/passive-album-candidate.ts`
- `lib/passive-album-candidate-server.ts`
- `app/(app)/pets/[petId]/album/candidate/page.tsx`
- `app/(app)/pets/[petId]/album/candidate/candidate-open-form.tsx`
- `app/(app)/pets/[petId]/album/candidate/actions.ts`
- `app/(app)/home/page.tsx`
- `app/(app)/pets/[petId]/album/page.tsx`
- `lib/uchinoco-now.ts`
- `app/(app)/dev/album-candidates/actions.ts`
- `app/(app)/dev/album-story/actions.ts`
- `app/(app)/dev/album-draft/actions.ts`
- `app/(app)/dev/photo-grouping/actions.ts`
- `lib/album-persistence/payload.ts`
- `tests/passive-album-candidate.test.mjs`
- `tests/photo-intake.test.mjs`
- `tests/uchinoco-now.test.mjs`

## 検証

- `node --experimental-strip-types --test tests/*.test.mjs`: 841 passed / 0 failed
- `npx tsc --noEmit`: 成功
- 変更範囲ESLint: error 0（既存Album pageの`<img>` warning 2件）
- `npm run build`: 成功（Next.js 16.3.5 / webpack）
- `git diff --check`: 成功
- 全体 `npm run lint`: 既存dirty tree内のTask063外ファイルと`supabase/.temp`生成物により失敗。Task063変更範囲にはerrorなし。

警告：Apple Silicon上のRosetta 2 Node警告、およびNode testの`MODULE_TYPELESS_PACKAGE_JSON`警告は既存環境由来。

## 残課題

- process-local Candidate cacheはserverless instanceをまたいで共有されない。Candidateは決定的に再現できるため正しさには影響しないが、cold start時は保存済み解析から再構築する。
- multi-pet Passive Candidateは未対応。
- threshold到達直後でもTask062 runnerが対象月全写真の必須解析を終えるまではReady表示しない。
- DB transaction外でalbum / photos / draft / coverを順番に保存するため、途中失敗時は作成したalbumを可能な範囲でcleanupする。deterministic IDによりretryは重複せず再開できる。

## Git

commit / pushは実施していない。
